const cool = require('cool-ascii-faces')
const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000
const cors = require('cors')
const bodyParser = require('body-parser')
const { Client } = require('pg')

console.log('process.env.DATABASE_URL', process.env.DATABASE_URL)
const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: false
})

db.connect()

/*
db.query('SELECT * from games;', (err, res) => {
  if (err) throw err
  for (let row of res.rows) {
    console.log(JSON.stringify(row));
  }
  db.end()
})
*/
function processCard (card, playerIndex, game, workerIndex) {
  // Two players can't use the same space
  if (card.player > -1) return;
  let player = game.players[playerIndex]
  // Can't play out of turn
  if (! player.myTurn) return;
  if (card.name === 'First player') {
    for (let p = 0; p < game.players.length; p++) {
      game.players[p].firstPlayer = (!game.players[p].firstPlayer)
    }
  }
  if (card.name === 'Launch rocket') {
    if (player.rocket[0] === 0 || player.rocket[2] === 0) {
      return;
    }
    let success = 15
    success += (player.rocket[1] + player.rocket[3] + player.rocket[4] + player.rocket[5] + player.rocket[6]) * 15
    if (getRandomInt(100) < success) {
      player.won = true
    } else {
      for (let r = 0; r < player.rocket.length; r++) {
        player.rocket[r] = 0
        player.workers[workerIndex] = 1
        card.player = -1
      }
    }
  }
  if (card.hasOwnProperty('cost')) {
    for (key in card.cost) {
      if (player[key] < card.cost[key]) return;
      player[key] -= card.cost[key]
    }
  }
  if (card.hasOwnProperty('gain')) {
    for (key in card.gain) {
      switch (key) {
        case 'worker':
          let addedWorker = false
          for (let i = 0; i < player.workers.length; i++) {
            let office = player.workers[i]
            if (office === 1) {
              player.workers[i] = 3
              addedWorker = true
            }
          }
          if (!addedWorker) return;
        break;
        case 'office':
          let addedOffice = false
          for (let i = 0; i < player.workers.length; i++) {
            if (player.workers[i] === 0) {
              player.workers[i] = 1
              addedOffice = true
              break;
            }
          }
          if (!addedOffice) return;
        break;
        case 'booster':
          // 0: cockpit 1: nosecone 2: booster1 3: booster2 4: booster3 5: fins2 6: fins1
          if (player.rocket[2] === 0) {
            player.rocket[2] = 1
          } else if (player.rocket[3] === 0) {
            player.rocket[3] = 1
          } else if (player.rocket[4] === 0) {
            player.rocket[4] = 1
          } else {
            return;
          }
        break;
        case 'cockpit':
          if (player.rocket[0] === 0) {
            player.rocket[0] = 1
          } else {
            return;
          }
        break;
        case 'wing':
          if (player.rocket[5] === 0) {
            player.rocket[5] = 1
          } else if (player.rocket[6] === 0) {
            player.rocket[6] = 1
          } else {
            return;
          }
        break;
        case 'nosecone':
          if (player.rocket[0] === 0) {
            player.rocket[0] = 1
          }
        break;
        default:
          player[key] += card.gain[key]
          if (card.name !== 'Grant writing') { // Grant writing never changes
            card.gain[key] = 0
          }
      }
    }
  }
  card.player = playerIndex
  player.workers[workerIndex] = 3

  // Does the other player have a free worker?
  let freeWorker = false
  let otherPlayer = game.players.find((p) => p.myTurn === false)
  console.log('otherPlayer.workers', otherPlayer.workers)
  for (let i = 0; i < otherPlayer.workers.length; i++) {
    if (otherPlayer.workers[i] === 2) {
      freeWorker = true
    }
  }
  console.log('freeWorker', freeWorker)
  if (freeWorker) {
    // Switch turns
    player.myTurn = false
    otherPlayer.myTurn = true
  } else {
    for (let i = 0; i < player.workers.length; i++) {
      if (player.workers[i] === 2) {
        freeWorker = true
      }
    }
  }

  if (!freeWorker) {
    // End of round
    endRound(game)
  }
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max))
}

function endRound(game) {
  for (let c = 0; c < game.activeCards.length; c++) {
    let card = game.activeCards[c]
    card.player = -1
    if (card.hasOwnProperty('upkeep')) {
      for (key in card['upkeep']) {
        card.gain[key] += card.upkeep[key]
      }
    }
    if (card.name === 'Junkyard') {
      card.gain.aluminum += getRandomInt(2)
      card.gain.carbon += getRandomInt(2)
      card.gain.electronics += getRandomInt(2)
    }
  }

  // Add new card
  if (game.upcomingCards.length > 0) {
    game.activeCards.push(game.upcomingCards.pop())
  } else {
    game.round++
    if (cards.length > game.round) {
      game.upcomingCards = game.upcomingCards.concat(cards[game.round])
    }
    // Payday
    for (let p = 0; p < game.players.length; p++) {
      for (let w = 0; w < game.players[p].workers.length; w++) {
        if (game.players[p].workers[w] === 3) {
          if (game.players[p].cash > 1) {
            game.players[p].cash -= 2
          } else {
            // worker gets 'fired'
            game.players[p].workers[w] = 1
          }
        }
      }
    }
  }

  // First player gets to start the turn
  for (let i = 0; i < game.players.length; i++) {
    let player = game.players[i]
    // Workers return
    for (let j = 0; j < player.workers.length; j++) {
      if (player.workers[j] === 3) {
        player.workers[j] = 2
      }
    }
    player.myTurn = player.firstPlayer
  }

}

const cards = [
  [ // Base cards
    {
      name: 'First player',
      player: -1
    },
    {
      name: 'Grant writing',
      gain: {
        cash: 2
      },
      player: -1
    },
    {
      name: 'Patent application',
      gain: {
        cash: 1
      },
      upkeep: {
        cash: 1
      },
      player: -1
    },
    {
      name: 'Junkyard',
      gain: {
        aluminum: 0,
        carbon: 0,
        electronics: 0
      },
      player: -1
    },
    {
      name: 'Workshop',
      gain: {
        electronics: 1
      },
      upkeep: {
        electronics: 1
      },
      player: -1
    },
    {
      name: 'Carbon fiber fabrication',
      gain: {
        carbon: 2
      },
      upkeep: {
        carbon: 2
      },
      player: -1
    },
    {
      name: 'Aluminum refinery',
      gain: {
        aluminum: 3
      },
      upkeep: {
        aluminum: 3
      },
      player: -1
    },
    {
      name: 'Build office',
      cost: {
        aluminum: 5,
        electronics: 2
      },
      gain: {
        office: 1
      },
      player: -1
    }
  ],
  [ // Week 2
    {
      name: 'Hire worker',
      player: -1,
      gain: {
        worker: 1
      },
      requires: [
        '1 empty office'
      ]
    },
    {
      name: 'Build command module',
      cost: {
        aluminum: 1,
        electronics: 1,
        carbon: 1,
        cash: 1
      },
      gain: {
        cockpit: 1
      },
      player: -1
    },
    {
      name: 'Hedge funds',
      gain: {
        cash: 1
      },
      upkeep: {
        cash: 1
      },
      player: -1
    },
  ]
  [ // Week 3
    {
      name: 'Build booster',
      cost: {
        aluminum: 2,
        carbon: 2,
        electronics: 1
      },
      gain: {
        booster: 1
      },
      player: -1
    },
    {
      name: 'Build delta wing',
      cost: {
        aluminum: 3,
        carbon: 3
      },
      gain: {
        wing: 1
      },
      player: -1
    },
    {
      name: 'Build nose cone',
      cost: {
        carbon: 6
      },
      gain: {
        nosecone: 1
      },
      player: -1
    }
  ],
  [
    {
      name: 'Launch rocket',
      player: -1,
      requires: [
        '1 command module',
        '1 booster'
      ]
    },
    {
      name: 'Aluminum scraps',
      gain: {
        aluminum: 2
      },
      upkeep: {
        aluminum: 2
      },
      player: -1
    },
    {
      name: 'Hostile takeover',
      gain: {
        cash: 3
      },
      upkeep: {
        cash: 3
      },
      player: -1
    }
  ]
]

function initGame () {
  let game = {
    round: 1,
    players: [
      {
        won: false,
        firstPlayer: true,
        player: 0,
        myTurn: true,
        name: 'Player 1',
        cash: 2,
        aluminum: 0,
        carbon: 0,
        electronics: 0,
        rocket: [0, 0, 0, 0, 0, 0, 0],
        workers: [2, 2, 0, 0, 0, 0]
      },
      {
        won: false,
        firstPlayer: false,
        player: 1,
        myTurn: false,
        name: 'Player 2',
        cash: 3,
        aluminum: 0,
        carbon: 0,
        electronics: 0,
        rocket: [0, 0, 0, 0, 0, 0, 0],
        workers: [2, 2, 0, 0, 0, 0]
      }
    ],
    activeCards: [],
    upcomingCards: []
  }

  game.activeCards = game.activeCards.concat(cards[0])
  game.upcomingCards = game.upcomingCards.concat(cards[1])
  return game
}

function initPlayer () {
  let player = {
    playerIndex: -1, // 0: player 1, 1: player 2
    gameIndex: -1, // assigned game
    lastSeen: -1 // unix timestamp of last request
  }
  return player
}

let games = []
let lookingForPlayers = [] // Players ones waiting for player twos
let players = {}

express()
  .use(cors())
  .use(express.static(path.join(__dirname, 'public')))
  .use(bodyParser.json())
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/game/:userId', (req, res) => {
    // existing player
    if (players.hasOwnProperty(req.params.userId)) {
      let player = players[req.params.userId]
      player.lastSeen = Date.now()
      let game = games[player.gameIndex]
      game.youAre = player.playerIndex
      res.send(game)
    } else {
      console.log('new player')
      // new player
      let player = initPlayer()
      let now = Date.now()
      player.lastSeen = now
      players[req.params.userId] = player
      for (let i = 0; i < lookingForPlayers.length; i++) {
        let playerOne = lookingForPlayers[i]
        console.log('looking for players', playerOne)
        console.log('now - lastSeen', now - playerOne.lastSeen)
        if (now - playerOne.lastSeen < 5000) { // player was recently connected
          // player is player 2
          player.playerIndex = 1
          // assign to same game
          player.gameIndex = playerOne.gameIndex
          lookingForPlayers.splice(i, 1)
          break
        }
      }
      if (player.gameIndex === -1) {
        // No available games, player is player 1
        console.log('no available games, start new game')
        player.playerIndex = 0
        let game = initGame()
        games.push(game)
        player.gameIndex = (games.length - 1)
        lookingForPlayers.push(player)
      }
      let game = games[player.gameIndex]
      game.youAre = player.playerIndex
      res.send(game)
    }
   })
  .get('/', (req, res) => res.render('pages/index'))
  .get('/cool', (req, res) => res.send(cool()))
  .post('/game/:userId', (req, res) => {
    if (players.hasOwnProperty(req.params.userId)) {
      let player = players[req.params.userId]
      let game = games[player.gameIndex]
      let card = game.activeCards[req.body.cardIndex]
      // console.log('req.body', req.body)
      // console.log('player', player.body)
      // console.log('game', game)
      // console.log('card', card)
      processCard (card, player.playerIndex, game, req.body.workerIndex)
      // games[req.params.userId].received = req.body
      game.youAre = player.playerIndex
      res.send(game)
    } else {
      res.send('No game with that ID found.')
    }
   })
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))


