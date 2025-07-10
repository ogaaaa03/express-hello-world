const express = require('express')
const expressWs = require('express-ws')

const app = express()
expressWs(app)

const port = process.env.PORT || 3001
let connects = []
//入室しているユーザー管理(重複を許さない)(カワグチ)
let players = new Set()

app.use(express.static('public'))

app.ws('/ws', (ws, req) => {
  connects.push(ws)

  ws.on('message', (message) => {
    //メッセージJSONに変換(カワグチ)
    const msg = JSON.parse(message)
    console.log('Received:', message)

    //参加したら(カワグチ)
    if (msg.type === 'join') {
      players.add(msg.id)

      // 全クライアントに現在の参加者リストを送信
      const playersMsg = JSON.stringify({
        type: 'players',
        players: Array.from(players),
      })

      connects.forEach((socket) => {
        if (socket.readyState === 1) {
          socket.send(playersMsg)
        }
      })

      // 他のクライアントに入室通知も送る
      const joinMsg = JSON.stringify({ type: 'join', id: msg.id })
      connects.forEach((socket) => {
        if (socket.readyState === 1) {
          socket.send(joinMsg)
        }
      })
      return
    }

    if (msg.type === 'start') {
      // 全接続にゲーム開始通知を送る
      connects.forEach((socket) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'start' }))
        }
      });
      return;
    }

    connects.forEach((socket) => {
      if (socket.readyState === 1) {
        // Check if the connection is open
        socket.send(message)
      }
    })
  })

  ws.on('close', () => {
    connects = connects.filter((conn) => conn !== ws)
  })
})

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})
