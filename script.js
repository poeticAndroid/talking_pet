import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5"
import AI from "./AI.js"
import Chat from "./Chat.js"
import Speaker from "./Speaker.js"

let llm, chat, tts, speaker
let currentSentence
let sendAs = "user"
let thinking

async function init() {
    // document.body.addEventListener("click", initAudio)
    $("form").addEventListener("submit", userSubmit)
    $("#ttsEnabled").addEventListener("change", e => {
        if ($("#ttsEnabled").checked) chat.pipeTo(tts)
        else chat.removePipeTo(tts)
        tts.shutdown()
        speaker.shutdown()
    })

        ; (llm = new AI("text-generation", "HuggingFaceTB/SmolLM2-1.7B-Instruct", {
            device: "webgpu", dtype: "fp16",
            max_new_tokens: 128, do_sample: true
        }))
            .pipeTo(chat = new Chat($("#log")))
        ; (tts = new AI("text-to-speech", "Xenova/speecht5_tts", {
            // device: "webgpu",
            quantized: false,
            speaker_embeddings: "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin"
        }))
            .pipeTo(speaker = new Speaker($("#log")))

    if ($("#ttsEnabled").checked) chat.pipeTo(tts)
    else chat.removePipeTo(tts)

    llm.addEventListener("statuschange", updateStatus)
    tts.addEventListener("statuschange", updateStatus)
    speaker.addEventListener("statuschange", updateStatus)
    setTimeout(updateStatus, 1024, llm)

    chat.queue({ role: "system", content: "You are an adorable pet that can talk." })
    chat.queue({ role: "user", content: "Hello there!" })
    think()
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
        currentSentence?.classList.remove("unread")
        currentSentence?.classList.remove("rendering")
        if (!currentSentence?.classList.contains("speaking"))
            currentSentence?.classList.add("queued")

        currentSentence = $("#sentence_" + tts.currentTask?.id)
        currentSentence?.classList.remove("unread")
        currentSentence?.classList.add("rendering")
    }

    if ($("#userInp").value == "/forever" && !(thinking || tts.isProcessing))
        setTimeout(() => { if (!(thinking || tts.isProcessing)) think() }, 1024)
}

function userSubmit(e) {
    e?.preventDefault()
    if (thinking || llm.isProcessing) return
    let userTxt = $("#userInp").value
    let parts = userTxt.split(" ")
    let message
    switch (parts[0]) {
        case "/help":
            chat.queue("/help - show this message")
            chat.queue("/unload - unload all AI models")
            chat.queue("/edit - edit last message")
            chat.queue("/forever - keep the AI going forever")
            break;

        case "/stop":
        case "/unload":
            llm.shutdown()
            tts.shutdown()
            speaker.shutdown()
            break;

        case "/edit":
            message = chat.pop()
            sendAs = message?.role || "system"
            setTimeout(() => { $("#userInp").value = message?.content })
            break;


        case "/forever":
            userTxt = ""
            setTimeout(() => { $("#userInp").value = "/forever" })
        default:
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
    $("#userInp").value = ""
}

async function think() {
    if (thinking || llm.isProcessing) return
    thinking = true
    await llm.queue({ input: chat.messages })
    thinking = llm.isProcessing
}



function $(selector) {
    return document.querySelector(selector)
}
function $$(selector) {
    return document.querySelectorAll(selector)
}

let _id = 1
init()
