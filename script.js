import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5"
import AI from "./AI.js"
import Chat from "./Chat.js"
import Speaker from "./Speaker.js"

let llm, chat, tts, speaker
let currentSentence
let sendAs = "user"
let thinking
let inputHeight = 64, history = []
let woke, autoUnload

let lastFile, llmFile, ttsFile, chatFile
let baseUrl = canonFile(".", "/")
let autoLog, lastLog, lastMessage

async function init() {
    $("form").addEventListener("submit", userSubmit)
    $("#userInp").addEventListener("keydown", e => {
        if (e.key == "Tab" && e.target.value.trim().slice(0, 1) == "/") {
            e.preventDefault()
            let userTxt = $("#userInp").value.trim()
            let parts = userTxt.split(/\s+/)
            let file = completeFile(parts.pop())
            $("#userInp").value = parts.join(" ") + " " + file + (file.slice(-1) == "/" ? "" : " ")
        }
        if ((e.key == "ArrowUp" || (e.key == "Backspace" && e.shiftKey)) && $("#userInp").selectionStart <= 0) setTimeout(e => { $("#userInp").value = history.pop() || "" })
        if (e.key == "Enter" && !e.shiftKey) userSubmit(e)
    })
    inputAutoHeight()
    $("#ttsEnabled").addEventListener("change", e => {
        if ($("#ttsEnabled").checked) chat.pipeTo(tts)
        else chat.removePipeTo(tts)
        chat.restart()
        tts.shutdown()
        speaker.shutdown()
    })

    llm = new AI()
    llm.pipeTo(chat = new Chat($("#log")))
    llm.pipeErrTo(chat)
    tts = new AI()
    tts.pipeTo(speaker = new Speaker($("#log")))
    tts.pipeErrTo(chat)

    llm.addEventListener("statuschange", updateStatus)
    tts.addEventListener("statuschange", updateStatus)
    speaker.addEventListener("statuschange", updateStatus)
    chat.queue({ role: "system", content: "Loading..." })

    setInterval(() => {
        lastMessage?.removeEventListener("dblclick", onMessageDblClick)
        lastMessage = $(`#message_${chat.messages[chat.messages.length - 1].id}`)
        lastMessage?.addEventListener("dblclick", onMessageDblClick)

        if (autoLog && (lastLog != chat.messages.length)) {
            urlfs.writeJson(chatFile, logChat(chatFile))
            lastLog = chat.messages.length
        }
    }, 1024)


    if (!urlfs.readText("default.json")) $("#userInp").value = "/help"
    await updateDefaults()
    loadConfig("default")
}

async function updateDefaults() {
    const files = ["default.json", "llm/default.json", "tts/default.json",
        "llm/smollm2-1.7b-instruct.json", "llm/smollm2-135m-instruct.json", "llm/smollm2-360m-instruct.json",
        "tts/mms-tts-eng.json", "tts/speecht5_tts.json", "tts/system.json"]
    for (let file of files) {
        urlfs.delete(file + "?new")
        await urlfs.preload(file, file + "?new")
        let user = urlfs.readJson(file)
        let old = urlfs.readJson(file + "?default") || {}
        let def = urlfs.readJson(file + "?new")
        for (let key in user) {
            if (JSON.stringify(user[key]) === JSON.stringify(old[key])) user[key] = def[key]
        }
        for (let key in def) {
            if (JSON.stringify(user[key]) === JSON.stringify(old[key])) user[key] = def[key]
        }
        urlfs.writeJson(file, user)
        urlfs.writeText(file + "?default", urlfs.readText(file + "?new"))
        urlfs.delete(file + "?new")
    }
    let j = urlfs.editJson("default.json")
    if (j.llm?.includes("default")) j.llm = urlfs.readJson("default.json?default").llm
    if (j.tts?.includes("default")) j.tts = urlfs.readJson("default.json?default").tts
    j.llm = canonFile(j.llm)
    j.tts = canonFile(j.tts)
    j = urlfs.editJson("default.json?default")
    j.llm = canonFile(j.llm)
    j.tts = canonFile(j.tts)
}

async function updateStatus(e) {
    let q = e.target
    let el
    if (q == llm) el = $("#llmStatus")
    if (q == tts) el = $("#ttsStatus")
    if (q == speaker) el = $("#speakerStatus")
    if (!el) return;

    if (q.isInitialized) {
        if (q.isProcessing) el.setAttribute("class", "busy")
        else el.setAttribute("class", "idle")
    } else {
        if (q.isProcessing) el.setAttribute("class", "init")
        else el.setAttribute("class", "")
    }

    if (currentSentence != $("#sentence_" + tts.currentTask?.id)) {
        currentSentence?.classList.remove("rendering")
        if (!currentSentence?.classList.contains("speaking"))
            currentSentence?.classList.add("queued")

        currentSentence = $("#sentence_" + tts.currentTask?.id)
        currentSentence?.classList.add("rendering")
    }

    if ($("#userInp").value.trim() == "/forever" && !(llm.isProcessing || tts.isProcessing))
        setTimeout(() => { if (!(llm.isProcessing || tts.isProcessing)) think() }, 1024)

    if (llm.isProcessing || tts.isProcessing) {
        $("#throbber").classList.add("active")
        if (woke?.released || !woke) woke = navigator.wakeLock.request("screen")
    } else {
        $("#throbber").classList.remove("active")
    }

    clearTimeout(autoUnload)
    autoUnload = setTimeout(async () => {
        llm.shutdown()
        tts.shutdown()
        speaker.shutdown()
        try { (await woke)?.release() } catch (error) { }
    }, 1024 * 64 * 4)

    woke = await woke
}




function userSubmit(e) {
    e?.preventDefault()
    $("#userInp").classList.remove(sendAs)
    let userTxt = $("#userInp").value.trim()
    let parts = userTxt.split(/\s+/)
    let message
    let file, content
    switch (parts[0].toLowerCase()) {
        case "/help":
            chat.queue("/help    - show this message")
            chat.queue("/cd      - change current working directory")
            chat.queue("/ls      - list files")
            chat.queue("/rm      - delete file")
            chat.queue("/open    - open file for editing")
            chat.queue("/load    - load chat or config file")
            chat.queue("/voices  - list local system voices")
            chat.queue("/log     - generate chat file")
            chat.queue("/stop    - interrupt the conversation")
            chat.queue("/reboot  - restart the app")
            chat.queue("/unload  - unload all AI models")
            chat.queue("/reload  - restart LLM model")
            chat.queue("/edit    - remove and edit last message")
            chat.queue("/forever - keep the AI going forever")
            break;

        case "/cd":
            urlfs.cd(completeFile(parts[1] || "."))
            if (!parts[1]) urlfs.cd()
            parts[1] = null
        case "/ls":
            file = completeFile(parts[1] || "./")
            chat.queue(`Directory listing of ${urlfs.absUrl(file).replace(location.toString(), "~/")}:\n`)
            urlfs.ls(file).sort().forEach(entry => !entry.includes("?") && chat.queue(entry))
            break;

        case "/rm":
            file = parts[1]
            if (!file) { chat.queue("No filename specified!"); break; }
            urlfs.delete(file)
            chat.queue(`${file} deleted!`)
            break;

        case "/open":
        case "/save":
            file = canonFile(parts[1] || lastFile)
            if (!file) {
                chat.queue("No filename specified!")
                break;
            }
            content = userTxt.replace(parts[0], "").replace(parts[1], "").trim()
            if (content) {
                try {
                    JSON.parse(content)
                    urlfs.writeText(file, content)
                    chat.queue(`${file} saved!`)
                    setTimeout(e => {
                        $("#userInp").value = `/load ${file}`
                    })
                } catch (error) {
                    chat.queue(`Syntax error!`)
                    return;
                }
            } else {
                setTimeout(e => {
                    $("#userInp").value = `/save ${file}\n${JSON.stringify(urlfs.readJson(file), null, 2)}`
                })
            }
            break;

        case "/load":
            file = completeFile(parts[1] || lastFile)
            if (!file) { chat.queue("No filename specified!"); break; }
            loadConfig(file)
            chat.queue(`${file} loaded!`)
            break;

        case "/voices":
            file = parts[1]?.toLocaleLowerCase() || ""
            chat.queue("System voices:")
            speechSynthesis.getVoices().forEach(v => v.name.toLocaleLowerCase().includes(file) && chat.queue(v.name))
            break;

        case "/log":
            file = canonFile(parts[1] || chatFile)
            content = logChat(file)
            setTimeout(e => {
                $("#userInp").value = `/save ${file}\n${JSON.stringify(content, null, 2)}`
            })
            break;

        case "/stop":
            if (speaker.isProcessing) setTimeout(e => {
                $("#userInp").value = "*interupts* "
            })
            chat.restart()
            tts.clear()
            if (tts.isProcessing) tts.shutdown()
            speaker.shutdown()
            break;

        case "/reboot":
            location.reload()
            chat.queue(`Rebooting ...`)
        case "/shutdown":
        case "/unload":
            llm.shutdown()
            chat.readAll()
            tts.shutdown()
            speaker.shutdown()
            thinking = false
            chat.queue(`Models unloaded.`)
            break;

        case "/reload":
            thinking = false
            llm.restart()
            chat.queue(`LLM restarted.`)
            break;

        case "/edit":
            chat.readAll()
            if (tts.isProcessing) tts.shutdown()
            speaker.clear()
            message = chat.pop()
            sendAs = message?.role || "system"
            setTimeout(() => { $("#userInp").value = message?.content })
            break;


        case "/forever":
            userTxt = ""
            setTimeout(() => { $("#userInp").value = "/forever" })
        default:
            if (userTxt.trim().slice(0, 1) == "/") {
                chat.queue(`Sorry. I don't know how to ${userTxt}.`)
                break;
            }
            if (userTxt) {
                if (thinking || llm.isProcessing) return
                message = {
                    id: _id++,
                    role: sendAs,
                    content: userTxt
                }
                chat.queue(message)
            }
            if (sendAs == "user") think()
            else sendAs = "user"
            break;
    }
    if (userTxt) {
        let i = history.indexOf(userTxt)
        if (i >= 0) history.splice(i, 1)
        history.push(userTxt)
    }
    $("#userInp").classList.add(sendAs)
    $("#userInp").value = userTxt.slice(0, 1) == "/" ? "/" : ""
}

function completeFile(filename = "default") {
    let dir, file = urlfs.absUrl(filename.toLowerCase(), "")
    if (!urlfs.readText(file)) {
        if (lastFile.slice(0, file.length) == file) file = lastFile
        if (chatFile.slice(0, file.length) == file) file = chatFile
        dir = urlfs.dirname(file)
        for (let f of urlfs.ls(dir).sort()) {
            f = dir + f
            if (f.slice(0, file.length) == file) file = f
        }
    }
    return file.replace(urlfs.pwd, "").split("?")[0]
}

function canonFile(filename = "default", ext = ".json") {
    filename = filename.toLowerCase()
    if (filename.slice(-ext.length) != ext) filename += ext
    lastFile = urlfs.absUrl(filename).replace(urlfs.absUrl("/"), "/")
    return lastFile
}

function loadConfig(file = baseUrl + "llm/default") {
    file = canonFile(file)
    let config = {}
    let content = {}
    switch (urlfs.readJson(file).task) {
        case "chat":
            autoLog = false
            chatFile = file
            content = urlfs.readJson(baseUrl + "default.json") || { task: "chat" }
            break;

        case "text-generation":
            llmFile = file
            content = urlfs.readJson(baseUrl + "llm/default.json") || { task: "text-generation" }
            break;

        case "text-to-speech":
            ttsFile = file
            content = urlfs.readJson(baseUrl + "tts/default.json") || { task: "text-to-speech" }
            break;
    }
    for (let key in content) config[key] = content[key]
    content = urlfs.readJson(file)
    for (let key in content) config[key] = content[key]
    switch (config.task) {
        case "chat":
            while (chat.messages.length) chat.pop()
            if (config.llm) loadConfig(config.llm)
            if (config.tts) loadConfig(config.tts)
            if (config.system) for (let message of config.system) { message.id = _id++; chat.queue(message) }
            if (config.intro) for (let message of config.intro) { message.id = _id++; chat.queue(message) }
            if (config.messages) for (let message of config.messages) { message.id = _id++; chat.queue(message) }
            setTimeout(() => {
                autoLog = config.auto_log
                let lastSentence = tts.inbox.pop()
                tts.clear()
                speaker.clear()
                chat.readAll()
                if (lastSentence) tts.queue(lastSentence)
            }, 32)
            break;

        case "text-generation":
            thinking = false
            llm.shutdown()
            llm.config = config
            break;

        case "text-to-speech":
            chat.readAll()
            tts.shutdown()
            tts.config = config
            speaker.hmmm = null
            speaker.ah = null
            break;
    }
    lastFile = file
}

function logChat(file = chatFile) {
    let f = lastFile
    chatFile = file = canonFile(file)
    let content = { task: "chat", auto_log: autoLog, llm: llmFile, tts: ttsFile, system: [], intro: [] }
    content.messages = JSON.parse(JSON.stringify(chat.messages))
    content.messages.forEach(message => delete message.id)
    while (content.messages[0]?.role == "system") content.system.push(content.messages.shift())
    while (content.messages[0]?.role == "assistant") content.intro.push(content.messages.shift())
    if (file != canonFile(baseUrl + "default")) {
        let def = urlfs.readJson(baseUrl + "default.json")
        for (let key of ["auto_log", "llm", "tts", "system", "intro"]) {
            if (JSON.stringify(def[key]) == JSON.stringify(content[key])) delete content[key]
        }
    }
    lastFile = f
    return content
}

async function think() {
    if (thinking || llm.isProcessing) return
    thinking = true
    llm.queue({ input: chat.messages, id: _id++ })
    setTimeout(() => { thinking = false }, 1024)
}

let _inputLength = 1024
let _inputHeightSpeed = 0
function inputAutoHeight() {
    requestAnimationFrame(inputAutoHeight)
    let el = $("#userInp")
    el.scrollTop += 1024
    let offset = el.scrollTop
    if (offset) {
        inputHeight += offset
        _inputLength = el.value.length
        _inputHeightSpeed = 0
    } else if (_inputLength > el.value.length) {
        inputHeight -= _inputHeightSpeed++
        if (inputHeight < 8) inputHeight = 8
    }
    el.style.height = inputHeight + "px"
    scrollBy(0, offset)
}

function onMessageDblClick(e) {
    e.preventDefault()
    if (tts.isProcessing) tts.shutdown()
    chat.readAll()
    speaker.clear()
    let message = chat.pop()
    sendAs = message?.role || "system"
    $("#userInp").classList.add(sendAs)
    $("#userInp").value = message?.content || ""
}

function $(selector) {
    return document.querySelector(selector)
}
function $$(selector) {
    return document.querySelectorAll(selector)
}

let _id = 1
init()
