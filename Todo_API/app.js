const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'todoApplication.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    await db.run(`
      CREATE TABLE IF NOT EXISTS todo (
        id INTEGER PRIMARY KEY,
        todo TEXT,
        priority TEXT,
        status TEXT
      )
    `)
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

app.get('/todos/', async (request, response) => {
  const {status, priority, search_q} = request.query

  if (status !== undefined && priority === undefined) {
    const todo = `
            SELECT
                *
            FROM
                todo
            WHERE
                status LIKE '%${status}%';
        `

    const todoR = await db.all(todo)
    response.send(todoR)
  } else if (priority !== undefined && status === undefined) {
    const getByPriority = `
            SELECT
                *
            FROM
                todo
            WHERE
                priority LIKE '%${priority}%';
        `

    const todoPriority = await db.all(getByPriority)
    response.send(todoPriority)
  }

  // SNR 3
  else if (priority !== undefined && status !== undefined) {
    const getByPriorityAndStatus = `
          SELECT
            *
          FROM
            todo
          WHERE
            priority LIKE '%${priority}%'
            AND
            status LIKE '%${status}%';`
    const priorityAndStatus = await db.all(getByPriorityAndStatus)
    response.send(priorityAndStatus)
  }

  // SNR 4
  else if (search_q !== undefined) {
    const getBySearch = `
      SELECT
        *
      FROM
        todo
      WHERE
        todo LIKE '%${search_q}%';`
    const searchQ = await db.all(getBySearch);
    response.send(searchQ);
  }
})

// API 2
app.get("/todos/:todoId/", async (request, response)=>{
  const {todoId} = request.params;
  const getByTodoId = `
    SELECT
      *
    FROM
      todo
    WHERE
      id = ${todoId};`;
  const byTodoId = await db.get(getByTodoId);
  response.send(byTodoId);
})

// API 3
app.post("/todos/", async (request, response)=>{
  const todoDetails = request.body;
  const {
    id,
    todo,
    priority,
    status
  } = todoDetails;
  const addTodo = `
    INSERT INTO
      todo (id, todo, priority, status)
    VALUES
      (
        ${id},
        '${todo}',
        '${priority}',
        '${status}'
      );`;
  await db.run(addTodo);
  response.send("Todo Successfully Added");
})

// API 4
app.put("/todos/:todoId/", async (request, response)=>{
  const {todoId} = request.params;
  const {status, priority, todo} = request.body;

  if(status !== undefined){
    const updateStatus = `
      UPDATE
        todo
      SET 
        status = '${status}'
      WHERE
        id = ${todoId};`;
    await db.run(updateStatus);
    response.send("Status Updated");
  }

  else if(priority !== undefined){
    const updatePriority = `
      UPDATE
        todo
      SET 
        priority = '${priority}'
      WHERE
        id = ${todoId};`;
    await db.run(updatePriority);
    response.send("Priority Updated")
  }

  else if(todo !== undefined){
    const updateTodo = `
      UPDATE
        todo
      SET 
        todo = '${todo}'
      WHERE
        id = ${todoId};`;
    await db.run(updateTodo);
    response.send("Todo Updated")
  }
})

// API 5
app.delete("/todos/:todoId/", async (request, response)=>{
  const {todoId} = request.params;
  const deleteTodo = `
  DELETE FROM
    todo
  WHERE
    id = ${todoId};`;
  await db.run(deleteTodo);
  response.send("Todo Deleted")
})

module.exports = app;