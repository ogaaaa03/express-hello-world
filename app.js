const express = require('express')
const expressWs = require('express-ws')

const app = express()
expressWs(app)

const port = process.env.PORT || 3001
let connects = []
//入室しているユーザー管理(重複を許さない)(カワグチ)
let players = new Set()
//// WebSocket接続とユーザーIDを紐付けるMap()
let wsUserMap = new Map()
//チャットの履歴(カワグチ)
let chatHistory = [];

// ターン制御を保持(カワグチ)
let turnOrder = [];
// 現在のターンを保持(カワグチ)
let currentTurnIndex = 0;
// ラウンドの制御(カワグチ)
let round = 1;

app.use(express.static('public'))

app.ws('/ws', (ws, req) => {
  connects.push(ws)


  ws.on('message', (message) => {
    //メッセージJSONに変換(カワグチ)
    const msg = JSON.parse(message)
    console.log('Received:', message)

    //undo/redo を最初に処理(お)
    if (msg.type === "undo" || msg.type === "redo" || msg.type === "paint") { //paint追加(カワグチ)
      broadcast(JSON.stringify(msg));
      return;
    }

    //参加したら(カワグチ)
    if (msg.type === 'join') {
      players.add(msg.id);
      wsUserMap.set(ws, msg.id);

      ws.send(JSON.stringify({
        type: 'init',
        players: Array.from(players),
        chatHistory: chatHistory
      }));


      const joinMsg = JSON.stringify({ type: 'join', id: msg.id });
      broadcast(joinMsg); // 全員にブロードキャスト
      broadcastPlayerCount();
      return;
    }

    if (msg.type === 'start') {
      // ひらがな1文字をランダムに選ぶ(カワグチ)
      const firstChar = getRandomHiragana();
      const shuffledPlayers = Array.from(players).sort(() => Math.random() - 0.5);
      console.log('Sending start message with turnOrder:', shuffledPlayers);
      turnOrder = shuffledPlayers;
      currentTurnIndex = 0;

      // 全接続にゲーム開始通知を送る(カワグチ)
      connects.forEach((socket) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({
            type: 'start',
            firstChar: firstChar,
            turnOrder: shuffledPlayers,
            remainingTime: 60,
          }));
        }
      });
      notifyNextTurn();
      return;
    }

    // turnが終了したら(カワグチ)
    if (msg.type === 'turn_end') {
      console.log('サーバーで turn_end を受信');
      advanceTurn();
      return;
    }

    // 描画が完了したら(カワグチ)
    if (msg.type === 'drawing_completed') {
      console.log('サーバーで drawing_completed を受信');
      // まだ回答ターンなのでターンは進めない
      return;
    }

    // 描画時間切れや回答時間切れおこしたとき(カワグチ)
    if (msg.type === 'drawing_time_up' || msg.type === 'answering_time_up') {
      console.log(`サーバーで ${msg.type} を受信`);
      advanceTurn();
      return;
    }

    //画像を送ったとき(カワグチ)
    if (msg.type === 'image_sended') {
      console.log('サーバーで image_sended を受信');
      // 画像データを送ってきた本人以外にブロードキャスト
      connects.forEach((socket) => {
        if (socket.readyState === 1 && socket !== ws) { // 送信者自身には送らない
          socket.send(JSON.stringify({ type: 'image_sended', imageData: msg.imageData }));
        }
      });
      return;
    }

    broadcast(message);
  })

  ws.on('close', () => {
    connects = connects.filter((conn) => conn !== ws)
    const userId = wsUserMap.get(ws);
    if (userId) {
      players.delete(userId);
      wsUserMap.delete(ws); // Mapからも削除
      console.log(`ユーザー ${userId} が切断されました。現在の登録プレイヤー: ${Array.from(players).length}`);
    } else {
      console.log('紐付けられたユーザーIDのないクライアントが切断されました。');
    }
    broadcastPlayerCount();

    const leaveMessage = {
      type: 'leave', // 新しいタイプ 'leave'
      id: userId // 誰が退室したか分かるようにIDを含める
    };
    broadcast(JSON.stringify(leaveMessage));
  })
})

// 全員に現在のプレイヤー数をブロードキャストする関数 (カワグチ)
function broadcastPlayerCount() {
  const playerCount = players.size; // 登録されているユニークなプレイヤーIDの数
  const message = JSON.stringify({
    type: 'player_count_update', // 新しいメッセージタイプ
    count: playerCount
  });
  connects.forEach((socket) => {
    if (socket.readyState === 1) { // OPEN状態のソケットにのみ送信
      socket.send(message);
    }
  });
  console.log(`現在の入室人数をブロードキャスト: ${playerCount}人`);

  // プレイヤーがいなくなった場合にゲームをリセットするなどの処理も検討
  if (playerCount === 0 && turnOrder.length > 0) {
    console.log("全プレイヤーが退出しました。ゲーム状態をリセットします。");
    resetGameState(); // 後述するリセット関数を呼び出す
  }
}
function resetGameState() {
  players.clear();
  wsUserMap.clear();
  chatHistory = [];
  turnOrder = [];
  currentTurnIndex = 0;
  round = 1;
}


//連絡する関数(カワグチ)
function broadcast(message) {
  connects.forEach((socket) => {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  });
}

//ターンを進める(カワグチ)
function advanceTurn() {
  currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
  if (currentTurnIndex === 0) {
    round++;
  }
  notifyNextTurn();
}

// 次のプレイヤーに通知(カワグチ)
function notifyNextTurn() {
  const currentPlayer = turnOrder[currentTurnIndex];
  const turnMsg = JSON.stringify({
    type: 'next_turn',
    currentTurn: currentPlayer,
    turnOrder: turnOrder,
    round: round
  });
  broadcast(turnMsg);
}

//ひらがな　一文字を選ぶ関数(カワグチ)
function getRandomHiragana() {
  const hira = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
  return hira[Math.floor(Math.random() * hira.length)];
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})
