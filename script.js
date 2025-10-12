import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5"
import AI from "./AI.js"
import Chat from "./Chat.js"
import Speaker from "./Speaker.js"

let llm, chat, tts, speaker
let currentSentence
let sendAs = "user"
let thinking
let inputHeight = 64

let lastFile, llmFile, ttsFile, chatFile
let baseUrl = canonFile(".", "/")


async function init() {
    $("form").addEventListener("submit", userSubmit)
    $("#userInp").addEventListener("keydown", e => {
        if (e.key == "Tab" && e.target.value.trim()) {
            e.preventDefault()
            let userTxt = $("#userInp").value.trim()
            let parts = userTxt.split(/\s+/)
            let file = completeFile(parts.pop())
            console.log("parts", parts)
            $("#userInp").value = parts.join(" ") + " " + file + (file.slice(-1) == "/" ? "" : " ")
        }
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
    setTimeout(updateStatus, 1024, llm)

    if (!urlfs.readText("_default.json")) $("#userInp").value = "/help"
    await urlfs.preload("_default.json", "llm/_default.json", "tts/_default.json", "_default.json")
    let j = urlfs.editJson("_default.json")
    j.llm = canonFile(j.llm)
    j.tts = canonFile(j.tts)
    loadConfig("_default")
    lastFile = llmFile
}

function updateStatus(q) {
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

    if ($("#userInp").value == "/forever" && !(thinking || tts.isProcessing))
        setTimeout(() => { think() }, 1024)
}

function userSubmit(e) {
    e?.preventDefault()
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
            chat.queue("/log     - generate chat file")
            chat.queue("/stop    - interrupt the conversation")
            chat.queue("/reboot  - restart the app")
            chat.queue("/unload  - unload all AI models")
            chat.queue("/reload  - restart LLM model")
            chat.queue("/edit    - edit last message")
            chat.queue("/forever - keep the AI going forever")
            break;

        case "/cd":
            urlfs.cd(completeFile(parts[1] || "."))
            if (!parts[1]) urlfs.cd()
            parts[1] = null
        case "/ls":
            file = completeFile(parts[1] || "./")
            chat.queue(`Directory listing of ${urlfs.absUrl(file).replace(location.toString(), "~/")}:`)
            urlfs.ls(file).sort().forEach(entry => chat.queue(entry))
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
                    content = JSON.stringify(JSON.parse(content), null, 2)
                } catch (error) {
                    setTimeout(e => {
                        $("#userInp").value = `/save ${file}\n${urlfs.readText(file)}`
                    })
                }
                urlfs.writeText(file, content)
                chat.queue(`${file} saved!`)
            } else {
                setTimeout(e => {
                    $("#userInp").value = `/save ${file}\n${urlfs.readText(file)}`
                })
            }
            break;

        case "/load":
            file = completeFile(parts[1] || lastFile)
            if (!file) { chat.queue("No filename specified!"); break; }
            loadConfig(file)
            chat.queue(`${file} loaded!`)
            break;

        case "/log":
            file = canonFile(parts[1] || chatFile)
            content = { task: "chat", llm: llmFile, tts: ttsFile, system: [], intro: [] }
            content.messages = JSON.parse(JSON.stringify(chat.messages))
            content.messages.forEach(message => delete message.id)
            while (content.messages[0]?.role == "system") content.system.push(content.messages.shift())
            while (content.messages[0]?.role == "assistant") content.intro.push(content.messages.shift())
            if (file != canonFile(baseUrl + "_default")) {
                let def = urlfs.readJson(baseUrl + "_default.json")
                for (let key of ["llm", "tts", "system", "intro"]) {
                    if (JSON.stringify(def[key]) == JSON.stringify(content[key])) delete content[key]
                }
            }
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
            if (thinking || llm.isProcessing) return
            if (userTxt.trim()) {
                message = {
                    role: sendAs,
                    content: userTxt
                }
                chat.queue(message)
            }
            if (sendAs == "user") think()
            else sendAs = "user"
            break;
    }
    $("#userInp").value = userTxt.slice(0, 1) == "/" ? "/" : ""
}

function completeFile(filename = "_default") {
    let dir, file = urlfs.absUrl(filename.toLowerCase(), "")
    console.log("in", file)
    if (!urlfs.readText(file)) {
        // if (lastFile.slice(0, file.length) == file) file = lastFile
        // if (chatFile.slice(0, file.length) == file) file = chatFile
        dir = urlfs.dirname(file)
        for (let f of urlfs.ls(dir).sort()) {
            f = dir + f
            if (f.slice(0, file.length) == file) file = f
        }
    }
    console.log("out", file.replace(urlfs.pwd, ""))
    return file.replace(urlfs.pwd, "")
}

function canonFile(filename = ".", ext = ".json") {
    filename = filename.toLowerCase()
    if (filename.slice(-ext.length) != ext) filename += ext
    lastFile = urlfs.absUrl(filename).replace(urlfs.absUrl("/"), "/")
    if (urlfs.readJson(filename)) {
        switch (urlfs.readJson(filename).task) {
            case "chat":
                chatFile = lastFile
                break;
            case "text-generation":
                llmFile = lastFile
                break;

            case "text-to-speech":
                ttsFile = lastFile
                break;
        }
    }
    return lastFile
}

function loadConfig(file = baseUrl + "llm/_default") {
    file = canonFile(file)
    let config = {}
    let content = {}
    switch (urlfs.readJson(file).task) {
        case "chat":
            content = urlfs.readJson(baseUrl + "_default.json") || { task: "chat" }
            break;

        case "text-generation":
            content = urlfs.readJson(baseUrl + "llm/_default.json") || { task: "text-generation" }
            break;

        case "text-to-speech":
            content = urlfs.readJson(baseUrl + "tts/_default.json") || { task: "text-to-speech" }
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
            if (config.system) for (let message of config.system) chat.queue(message)
            if (config.intro) for (let message of config.intro) chat.queue(message)
            if (config.messages) for (let message of config.messages) chat.queue(message)
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
            break;
    }
    lastFile = file
}

async function think() {
    if (thinking || llm.isProcessing) return
    thinking = true
    await llm.queue({ input: chat.messages })
    thinking = llm.isProcessing
}

let _inputLength = 1024
function inputAutoHeight() {
    requestAnimationFrame(inputAutoHeight)
    let el = $("#userInp")
    el.scrollTop += 1024
    let offset = el.scrollTop
    if (offset) {
        inputHeight += offset
        _inputLength = el.value.length
    } else if (_inputLength > el.value.length) {
        inputHeight--
    }
    el.style.height = inputHeight + "px"
    scrollBy(0, offset)
}


function $(selector) {
    return document.querySelector(selector)
}
function $$(selector) {
    return document.querySelectorAll(selector)
}

let _id = 1
init()
