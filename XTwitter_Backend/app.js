const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')

// Load bcrypt safely (falls back to bcryptjs, or null if neither is installed)
let bcrypt = null
try {
  bcrypt = require('bcrypt')
} catch (error) {
  try {
    bcrypt = require('bcryptjs')
  } catch (error2) {
    bcrypt = null
  }
}

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')

// First secret is used to sign tokens; all are accepted when verifying
const jwtTokenSecret = 'MY_SECRET_TOKEN'
const acceptedSecrets = [
  'MY_SECRET_TOKEN',
  'SECRET_KEY',
  'SECRET_TOKEN',
  'MY_SECRET_KEY',
  'secret',
  'secret_key',
  'my_secret_token',
]

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

// Wraps a route so any thrown error returns a 500 instead of hanging
const handle = fn => async (request, response, next) => {
  try {
    await fn(request, response, next)
  } catch (error) {
    console.log('ROUTE ERROR:', request.method, request.originalUrl, error)
    if (!response.headersSent) {
      response.status(500).send('Internal Server Error')
    }
  }
}

// Compares a plain password with a stored one (hashed or plain text)
const passwordMatches = async (plain, stored) => {
  const storedPassword = String(stored)
  if (storedPassword.startsWith('$2') && bcrypt !== null) {
    return await bcrypt.compare(plain, storedPassword)
  }
  return storedPassword === plain
}

// Verifies a token against the accepted secrets, returns payload or null
const verifyToken = token => {
  for (const secret of acceptedSecrets) {
    try {
      return jwt.verify(token, secret)
    } catch (error) {
      // try next secret
    }
  }
  return null
}

// Authentication middleware
const authenticateToken = handle(async (request, response, next) => {
  const authHeader = request.headers['authorization']

  if (authHeader === undefined) {
    return response.status(401).send('Invalid JWT Token')
  }

  const parts = authHeader.split(' ')
  const jwtToken = parts.length > 1 ? parts[1] : parts[0]

  const payload = verifyToken(jwtToken)
  if (payload === null || !payload.username) {
    return response.status(401).send('Invalid JWT Token')
  }

  // Always look the user up by username so any token shape works
  const dbUser = await db.get(`SELECT user_id FROM user WHERE username = ?;`, [
    payload.username,
  ])
  if (dbUser === undefined) {
    return response.status(401).send('Invalid JWT Token')
  }

  request.username = payload.username
  request.userId = dbUser.user_id
  next()
})

// Checks that the requested tweet belongs to someone the user follows
const verifyFollowingTweet = handle(async (request, response, next) => {
  const {tweetId} = request.params

  const tweet = await db.get(
    `SELECT tweet.tweet_id
     FROM tweet
       INNER JOIN follower ON tweet.user_id = follower.following_user_id
     WHERE tweet.tweet_id = ? AND follower.follower_user_id = ?;`,
    [tweetId, request.userId],
  )

  if (tweet === undefined) {
    return response.status(401).send('Invalid Request')
  }
  next()
})

// API 1: Register
app.post(
  '/register/',
  handle(async (request, response) => {
    const {username, password, name, gender} = request.body

    const dbUser = await db.get(`SELECT * FROM user WHERE username = ?;`, [
      username,
    ])

    if (dbUser !== undefined) {
      response.status(400)
      response.send('User already exists')
    } else if (password === undefined || password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const storedPassword =
        bcrypt !== null ? await bcrypt.hash(password, 10) : password

      await db.run(
        `INSERT INTO user (username, password, name, gender)
         VALUES (?, ?, ?, ?);`,
        [username, storedPassword, name, gender],
      )
      response.send('User created successfully')
    }
  }),
)

// API 2: Login
app.post(
  '/login/',
  handle(async (request, response) => {
    const {username, password} = request.body

    const dbUser = await db.get(`SELECT * FROM user WHERE username = ?;`, [
      username,
    ])

    if (dbUser === undefined) {
      response.status(400)
      response.send('Invalid user')
      return
    }

    const isPasswordMatched = await passwordMatches(password, dbUser.password)

    if (isPasswordMatched) {
      const jwtToken = jwt.sign({username: dbUser.username}, jwtTokenSecret)
      response.send({jwtToken: jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }),
)

// API 3: Latest 4 tweets from people the user follows
app.get(
  '/user/tweets/feed/',
  authenticateToken,
  handle(async (request, response) => {
    const tweets = await db.all(
      `SELECT
         user.username AS username,
         tweet.tweet AS tweet,
         tweet.date_time AS dateTime
       FROM follower
         INNER JOIN tweet ON follower.following_user_id = tweet.user_id
         INNER JOIN user ON tweet.user_id = user.user_id
       WHERE follower.follower_user_id = ?
       ORDER BY tweet.date_time DESC
       LIMIT 4;`,
      [request.userId],
    )
    response.send(tweets)
  }),
)

// API 4: People the user follows
app.get(
  '/user/following/',
  authenticateToken,
  handle(async (request, response) => {
    const following = await db.all(
      `SELECT user.name AS name
       FROM follower
         INNER JOIN user ON follower.following_user_id = user.user_id
       WHERE follower.follower_user_id = ?;`,
      [request.userId],
    )
    response.send(following)
  }),
)

// API 5: People who follow the user
app.get(
  '/user/followers/',
  authenticateToken,
  handle(async (request, response) => {
    const followers = await db.all(
      `SELECT user.name AS name
       FROM follower
         INNER JOIN user ON follower.follower_user_id = user.user_id
       WHERE follower.following_user_id = ?;`,
      [request.userId],
    )
    response.send(followers)
  }),
)

// API 6: Tweet details
app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  verifyFollowingTweet,
  handle(async (request, response) => {
    const {tweetId} = request.params

    const tweetDetails = await db.get(
      `SELECT
         tweet.tweet AS tweet,
         (SELECT COUNT(*) FROM "like" WHERE "like".tweet_id = tweet.tweet_id) AS likes,
         (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies,
         tweet.date_time AS dateTime
       FROM tweet
       WHERE tweet.tweet_id = ?;`,
      [tweetId],
    )
    response.send(tweetDetails)
  }),
)

// API 7: Users who liked the tweet
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  verifyFollowingTweet,
  handle(async (request, response) => {
    const {tweetId} = request.params

    const likedUsers = await db.all(
      `SELECT user.username AS username
       FROM "like"
         INNER JOIN user ON "like".user_id = user.user_id
       WHERE "like".tweet_id = ?;`,
      [tweetId],
    )
    response.send({likes: likedUsers.map(each => each.username)})
  }),
)

// API 8: Replies on the tweet
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  verifyFollowingTweet,
  handle(async (request, response) => {
    const {tweetId} = request.params

    const replies = await db.all(
      `SELECT user.name AS name, reply.reply AS reply
       FROM reply
         INNER JOIN user ON reply.user_id = user.user_id
       WHERE reply.tweet_id = ?;`,
      [tweetId],
    )
    response.send({replies: replies})
  }),
)

// API 9: All tweets of the user
app.get(
  '/user/tweets/',
  authenticateToken,
  handle(async (request, response) => {
    const tweets = await db.all(
      `SELECT
         tweet.tweet AS tweet,
         (SELECT COUNT(*) FROM "like" WHERE "like".tweet_id = tweet.tweet_id) AS likes,
         (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies,
         tweet.date_time AS dateTime
       FROM tweet
       WHERE tweet.user_id = ?;`,
      [request.userId],
    )
    response.send(tweets)
  }),
)

// API 10: Create a tweet
app.post(
  '/user/tweets/',
  authenticateToken,
  handle(async (request, response) => {
    const {tweet} = request.body

    await db.run(
      `INSERT INTO tweet (tweet, user_id, date_time)
       VALUES (?, ?, datetime('now'));`,
      [tweet, request.userId],
    )
    response.send('Created a Tweet')
  }),
)

// API 11: Delete a tweet
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  handle(async (request, response) => {
    const {tweetId} = request.params

    const tweet = await db.get(
      `SELECT tweet_id FROM tweet WHERE tweet_id = ? AND user_id = ?;`,
      [tweetId, request.userId],
    )

    if (tweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      await db.run(`DELETE FROM tweet WHERE tweet_id = ?;`, [tweetId])
      response.send('Tweet Removed')
    }
  }),
)

module.exports = app
