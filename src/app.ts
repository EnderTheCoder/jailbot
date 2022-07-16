import {SocksClient} from "socks/typings/client/socksclient";

const mineflayer = require("mineflayer")
import {Client} from "minecraft-protocol"
const {Vec3} = require("vec3");
const {goals, Movements, pathfinder} = require("mineflayer-pathfinder")
const {mineflayer: mineflayerViewer} = require('prismarine-viewer')
const socks = require('socks').SocksClient

const { exec } = require('child_process');
const delayForEachDig = 5 // depends on your network, if your network sucks like mine then turn it higher.  0-5

let totalDigAmount = 0
let isInventoryFull = false
let isFirstBlockToDig = false

exec("npm config set proxy=http://localhost:10809")

const bot = mineflayer.createBot({
    auth: "microsoft",
    username: "EnderTheCoder",
    host: "mccentral.org"
})
// const bot = mineflayer.createBot({
//     username: "ender"
// })

function isBlock(block) {
    return (block.name.search("ore") != -1) && block.position.y - bot.entity.position.y < 4;
}

bot.once("spawn", async () => {
    mineflayerViewer(bot, {port: 3007, firstPerson: true}) // port is the minecraft server port, if first person is false, you get a bird's-eye view

    const mcData = require('minecraft-data')(bot.version)
    bot.loadPlugin(pathfinder)
    await bot.waitForChunksToLoad()
    bot.chat("/server prison")
    await bot.waitForTicks(60)
    bot.chat("/p warp netch")
    await bot.waitForTicks(80)

    console.log("bot entered the right warp")

    let movement = new Movements(bot, mcData)
    movement.scafoldingBlocks = []
    movement.climbable = []
    movement.canDig = true
    bot.pathfinder.setMovements(movement)

    console.log("digging process start")

    while (true) {

        if (isInventoryFull === true) {
            await discharge()
        }


        await simpleModeMining()
        // await layerModeMining()
        // await stupidDig()

    }

})

async function simpleModeMining() {
    let block = bot.findBlock({
        matching: isBlock,
        useExtraInfo: true,
        maxDistance: 4
    })
    if (block == null) {
        block = bot.findBlock({
            point: bot.entity.position.offset(0, 1, 0),
            matching: isBlock,
            useExtraInfo: true,
            maxDistance: 64
        })
        if (block == null) {
            bot.quit("no target detected. i'm out")

            return
        }

        if (isFirstBlockToDig == true) {
            isFirstBlockToDig = false
            let goal = new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z)
            await bot.pathfinder.goto(goal)
        }
    }
    // bot.waitForTicks(200).then(() => {
    //     if (bot.blockAt(block.position).name != "air") bot.chat("/p warp netch")
    // })
    await tryDig(block, 0)

}

async function tryDig(block, count) {
    if (count == 5) {
        console.error("digging failed 5 times at (" + block.position.x + "," + block.position.y + "," + block.position.z + "). give up on this block")
        return
    }

    if (count > 0) console.warn("digging process at (" + block.position.x + "," + block.position.y + "," + block.position.z + ") failed, retrying for the" + count + " times")

    try {
        let goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, 4)


        // let goal = new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z)
        // console.log(bot.pathfinder.bestHarvestTool(block))
        // await bot.setQuickBarSlot(0)
        await bot.equip(bot.pathfinder.bestHarvestTool(block), "hand")
        await bot.pathfinder.goto(goal)
        await bot.dig(block, true)

    } catch (e) {
        console.error(e)
        console.warn("dig err at pos: " + block.position);
    }
    await bot.waitForTicks(delayForEachDig)
    if (bot.blockAt(block.position).name == "air") {
        console.log("dig success " + ++totalDigAmount)
        return
    } else await tryDig(block, count++)
}

async function discharge() {
    bot.chat("/p warp netch")
    await bot.waitForTicks(20)

    let chest = bot.findBlock({
        maxDistance: 128,
        matching: searchChest
    })
    if (chest != null) {
        let goal = new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 4)
        await bot.pathfinder.goto(goal)
        await bot.openContainer(chest)
        let token = getToken(bot.currentWindow)
        if (token != null) {
            console.log("found " + token.count + " tokens")
            let chestSlot = getEmptyChestSlot(bot.currentWindow)
            if (chestSlot != null) {
                await bot.currentWindow.deposit(token.type, token.metadata, token.count, null)
            } else {
                console.log("nearest chest is full. give up token deposit.")
            }
            await bot.closeWindow(bot.currentWindow)
        } else {
            console.log("found 0 token.")
        }
    }

    let signs = getSigns()
    for (let sign of signs) {
        let goal = new goals.GoalNear(sign.position.x, sign.position.y, sign.position.z, 4)
        await bot.pathfinder.goto(goal)
        await bot.dig(sign)
    }

    isInventoryFull = false
    isFirstBlockToDig = true
}


function getToken(window) {
    console.log(window.slots)
    for (let item of window.slots) {
        if (item != null && item.customName != null) {
            if (item.customName.search("Token") != -1 && item.slot > 53) return item
        }
    }
    return null
}

function getEmptyChestSlot(window) {
    for (let i = 0; i < 54; i++) {
        if (window.slots[i] == null) return i
    }
    return null
}

function getSigns() {
    let signs = bot.findBlocks({
        matching: searchSign,
        count: 10,
        maxDistance: 64,
        useExtraInfo: true
    })
    console.log("found " + signs.length + " signs")
    return signs.map((vector) => {
        return bot.blockAt(vector)
    })
}

function searchSign(block) {
    return block.blockEntity != undefined && block.blockEntity.Text1.toString().search("Sell") != -1
}

function searchChest(block) {
    return block.name.search("chest") != -1
}


bot.on("messagestr", (message) => {
    // console.log(message)
    if (message.search("inventory is currently full") != -1) {
        isInventoryFull = true
        console.log("inventory full detected. get to discharge")
    }
})
bot.on('kicked', console.warn)
bot.on('error', console.warn)