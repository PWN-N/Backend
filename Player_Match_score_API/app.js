const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'cricketMatchDetails.db')

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
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

// API 1
app.get('/players/', async (request, response) => {
  const getPlayersQuery = `
      SELECT
        player_id AS playerId,
        player_name AS playerName
      FROM 
        player_details
      ORDER BY 
        player_id;`
  const playerArray = await db.all(getPlayersQuery)
  response.send(playerArray)
})

// API 2
app.get('/players/:playerId/', async (request, response) => {
  const {playerId} = request.params
  const getPlayerQuery = `
      SELECT 
        player_id AS playerId,
        player_name AS playerName
      FROM 
        player_details
      WHERE
        player_id = ${playerId};`
  const player = await db.get(getPlayerQuery)
  response.send(player)
})

// API 3
app.put('/players/:playerId/', async (request, response) => {
  const {playerId} = request.params
  const playerDetails = request.body
  const {playerName} = playerDetails
  const updatePlayerQuery = `
      UPDATE 
        player_details
      SET 
        player_name = '${playerName}'
      WHERE 
        player_id = ${playerId};`
  await db.run(updatePlayerQuery)
  response.send('Player Details Updated')
})

// API 4
app.get('/matches/:matchId/', async (request, response) => {
  const {matchId} = request.params
  const getMatchQuery = `
      SELECT 
        match_id AS matchId,
        match,
        year
      FROM 
        match_details
      WHERE
        match_id = ${matchId};`
  const match = await db.get(getMatchQuery)
  response.send(match)
})

// API 5
app.get('/players/:playerId/matches/', async (request, response) => {
  const {playerId} = request.params
  const getPlayerMatchesQuery = `
      SELECT 
        match_details.match_id AS matchId,
        match_details.match,
        match_details.year
      FROM
        player_match_score
      INNER JOIN 
        match_details
      ON player_match_score.match_id = match_details.match_id
      WHERE 
        player_match_score.player_id = ${playerId};`
  const matches = await db.all(getPlayerMatchesQuery)
  response.send(matches)
})

// API 6
app.get('/matches/:matchId/players/', async (request, response) => {
  const {matchId} = request.params
  const getMatchesPlayerQuery = `
      SELECT
        player_details.player_id AS playerId,
        player_details.player_name AS playerName
      FROM 
        player_match_score
      INNER JOIN 
        player_details
      ON player_match_score.player_id = player_details.player_id
      WHERE 
        player_match_score.match_id = ${matchId};`
  const players = await db.all(getMatchesPlayerQuery)
  response.send(players)
})

// API 7
app.get('/players/:playerId/playerScores/', async (request, response) => {
  const {playerId} = request.params
  const getPlayerScoresDetails = `
    SELECT 
      player_details.player_id AS playerId,
      player_details.player_name AS playerName,
      SUM(player_match_score.score) AS totalScore,
      SUM(player_match_score.fours) AS totalFours,
      SUM(player_match_score.sixes) AS totalSixes
    FROM
      player_match_score
    INNER JOIN 
      player_details
    ON player_match_score.player_id = player_details.player_id
    WHERE 
      player_match_score.player_id = ${playerId};`
  const playerScores = await db.get(getPlayerScoresDetails)
  response.send(playerScores)
})

module.exports = app
