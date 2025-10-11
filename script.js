import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5"
import AI from "./AI.js"
import Chat from "./Chat.js"
import Speaker from "./Speaker.js"

let llm, chat, tts, speaker
let currentSentence
let sendAs = "user"
let thinking
let inputHeight = 64

async function init() {
    // document.body.addEventListener("click", initAudio)
    $("form").addEventListener("submit", userSubmit)
    $("#userInp").addEventListener("keydown", e => {
        if (e.key == "Tab") {
            e.preventDefault()
            let userTxt = $("#userInp").value.trim()
            let parts = userTxt.split(/\s+/)
            let file = completeFile(parts.pop())
            $("#userInp").value = parts.join(" ") + " " + file + "\n"
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
    tts = new AI()
    tts.pipeTo(speaker = new Speaker($("#log")))

    llm.addEventListener("statuschange", updateStatus)
    tts.addEventListener("statuschange", updateStatus)
    speaker.addEventListener("statuschange", updateStatus)
    setTimeout(updateStatus, 1024, llm)

    if (!urlfs.readText("default.json")) $("#userInp").value = "/help"
    await urlfs.preload("default.json", "default_llm.json", "default_tts.json", "default_chat.json")
    loadConfig("default_llm.json")
    loadConfig("default_tts.json")
    loadConfig("default_chat.json")

    setTimeout(() => {
        if ($("#ttsEnabled").checked) chat.pipeTo(tts)
        else chat.removePipeTo(tts)
        // think()
    }, 1024)

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
            chat.queue("/load    - load config file")
            chat.queue("/log     - generate chat config file")
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
            chat.queue(`Directory listing of ${urlfs.absUrl(file)}:`)
            urlfs.ls(file).sort().forEach(entry => chat.queue(entry))
            break;

        case "/rm":
            urlfs.delete(parts[1])
            break;

        case "/open":
            file = completeFile(parts[1] || "default_llm")
        case "/save":
            file = file || canonFile(parts[1] || "default_llm")
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
            } else {
                setTimeout(e => {
                    $("#userInp").value = `/save ${file}\n${urlfs.readText(file)}`
                })
            }
            break;

        case "/load":
            file = completeFile(parts[1] || "default_llm")
            if (!file) { chat.queue("No filename specified!"); break; }
            loadConfig(file)
            break;

        case "/log":
            file = completeFile(parts[1] || "default_chat")
            content = { task: "chat" }
            content.messages = JSON.parse(JSON.stringify(chat.messages))
            content.messages.forEach(message => delete message.id)
            setTimeout(e => {
                $("#userInp").value = `/save ${file}\n${JSON.stringify(content, null, 2)}`
            })
            break;

        case "/stop":
            if (speaker.isProcessing) setTimeout(e => {
                if ($("#userInp").value.slice(0, 1) != "/")
                    $("#userInp").value = "*interupts* "
            })
            chat.restart()
            tts.clear()
            if (tts.isProcessing) tts.shutdown()
            speaker.shutdown()
            break;

        case "/reboot":
            location.reload()
        case "/unload":
            llm.shutdown()
            chat.readAll()
            tts.shutdown()
            speaker.shutdown()
            thinking = false
            break;

        case "/reload":
            thinking = false
            llm.restart()
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

function completeFile(filename = "default_llm") {
    let dir, file = filename.toLowerCase()
    if (!urlfs.readText(file)) {
        dir = urlfs.dirname(file)
        for (let f of urlfs.ls(dir).sort()) {
            f = dir + f
            if (f.slice(0, file.length) == file) file = f
        }
    }
    return file
}

function canonFile(filename = ".", ext = ".json") {
    filename = filename.toLowerCase()
    if (filename.slice(-ext.length) != ext) filename += ext
    return filename
}

function loadConfig(file = "default_llm") {
    file = canonFile(file)
    let config = {}
    let content = urlfs.readJson("default.json")
    for (let key in content) config[key] = content[key]
    switch (urlfs.readJson(file).task) {
        case "chat":
            content = urlfs.readJson("default_chat.json")
            break;
        case "text-generation":
            content = urlfs.readJson("default_llm.json")
            break;

        case "text-to-speech":
            content = urlfs.readJson("default_tts.json")
            break;
    }
    for (let key in content) config[key] = content[key]
    content = urlfs.readJson(file)
    for (let key in content) config[key] = content[key]
    switch (config.task) {
        case "chat":
            while (chat.messages.length) chat.pop()
            for (let message of config.messages) chat.queue(message)
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
