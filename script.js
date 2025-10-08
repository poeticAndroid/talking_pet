import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5"

let llm, tts
let chat = []

let audioCtx, speaking
let ttsQueue = []

async function init() {
    document.body.addEventListener("click", initAudio)
    $("form").addEventListener("submit", userSubmit)

    logMessage({ role: "system", content: "You are an adorable pet that can talk." })
    logMessage({ role: "user", content: "Hello there!" })
    think()
}

function initAudio(e) {
    if (!audioCtx) audioCtx = new AudioContext()
    if (e) {
        let osc = audioCtx.createOscillator()
        osc.connect(audioCtx.destination)
        osc.start()
        setTimeout((e) => {
            osc.stop()
        }, 32)
        document.body.removeEventListener("click", initAudio)
    }
}
async function initLLM() {
    if (llm) return;
    $("#llmStatus").classList.remove("busy")
    $("#llmStatus").classList.add("init")
    llm = new Worker('worker.js', { type: "module" })
    await runWorker(llm)
    let result = await runWorker(llm, "init", "text-generation", "HuggingFaceTB/SmolLM2-1.7B-Instruct", {
        // device: "webgpu",
        dtype: "fp16"
    })
    if (result.success) {
        $("#llmStatus").classList.remove("init")
        $("#llmStatus").classList.add("idle")
    } else {
        log(JSON.stringify(result))
        throw result
    }
    return result
}

async function initTTS() {
    if (tts) return;
    $("#ttsStatus").classList.remove("busy")
    $("#ttsStatus").classList.add("init")
    tts = new Worker('worker.js', { type: "module" })
    await runWorker(tts)
    let result = await runWorker(tts, "init", "text-to-speech", "Xenova/speecht5_tts", {
        // device: "webgpu",
        quantized: false
    })
    if (result.success) {
        $("#ttsStatus").classList.remove("init")
        $("#ttsStatus").classList.add("idle")
    } else {
        log(JSON.stringify(result))
        throw result
    }
    return result
}



function userSubmit(e) {
    e.preventDefault()
    let userTxt = $("#userInp").value
    let parts = userTxt.split(" ")
    switch (parts[0]) {
        case "/reload":
            llm && llm.terminate()
            llm = null
            $("#llmStatus").setAttribute("class", "")
            tts && tts.terminate()
            tts = null
            $("#ttsStatus").setAttribute("class", "")
            break;

        default:
            if (userTxt.trim()) {
                let message = {
                    role: "user",
                    content: userTxt
                }
                logMessage(message)
            }
            think()
            break;
    }
    $("#userInp").value = ""
}

async function think() {
    await initLLM()
    $("#llmStatus").classList.add("busy")
    try {
        let result = await runWorker(llm, "process", chat, {
            max_new_tokens: 128,
            do_sample: true
        })
        $("#llmStatus").classList.remove("busy")
        let message = result[0].generated_text.pop()
        logMessage(message)
        // $("#userInp").focus()
        await speak(message.content)
    } catch (error) {
        log(JSON.stringify(error))
        llm && llm.terminate()
        llm = null
        $("#llmStatus").setAttribute("class", "")
    }
}

async function speak(txt) {
    if (!$("#ttsEnabled").checked) return;
    await initTTS()

    $("#ttsStatus").classList.add("busy")
    let sentences = splitSentences(txt)
    let speaker_embeddings =
        "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin"
    for (let sentence of sentences) {
        if (!sentence.trim()) continue;
        try {
            let speech = await runWorker(tts, "process", sentence.trim(), { speaker_embeddings })
            speech.text = sentence.trim()
            console.log("Queuing:", speech.text)
            ttsQueue.push(speech)
            processTtsQueue()
        } catch (error) {
            log(JSON.stringify(error))
            tts && tts.terminate()
            tts = null
            $("#ttsStatus").setAttribute("class", "")
        }
    }
    $("#ttsStatus").classList.remove("busy")
}

function splitSentences(txt) {
    let sentences = [""]
    let quot,
        wrap,
        parens = 0
    for (let char of txt) {
        sentences[sentences.length - 1] += char
        if (quot || parens) {
            switch (char) {
                case quot:
                    quot = null
                    break;
                case "(":
                    parens++
                    break;
                case ")":
                    parens--
                    break;

                case ".":
                case "!":
                case "?":
                case ":":
                case ";":
                    wrap = true
                    break;
            }
            if (wrap && !(quot || parens)) {
                sentences.push("")
                wrap = false
            }
        } else {
            switch (char) {
                // case '"':
                // case "'":
                //     quot = char
                //     if (sentences[sentences.length - 1].slice(-2).trim().length > 1)
                //         quot = null
                //     break;

                // case "(":
                //     parens++
                //     break;

                case ".":
                case "!":
                case "?":
                case ":":
                case ";":
                    if (sentences[sentences.length - 1] == char)
                        sentences[sentences.length - 2] += sentences.pop()
                    sentences.push("")
                    break;
            }
        }
    }
    if (!sentences[sentences.length - 1].trim()) sentences.pop()
    return sentences
}

function processTtsQueue() {
    if (speaking) return;
    if (ttsQueue.length == 0) return;
    let speech = ttsQueue.shift()

    initAudio()
    speaking = true
    let audioBuffer = audioCtx.createBuffer(
        1,
        speech.audio.length,
        speech.sampling_rate
    )
    audioBuffer.copyToChannel(speech.audio, 0)
    let audioSource = audioCtx.createBufferSource()
    audioSource.buffer = audioBuffer
    audioSource.connect(audioCtx.destination)
    audioSource.start()
    let spans = $$(".sentence")
    let i = spans.length
    while (i--) {
        if (spans[i].textContent.trim() == speech.text) {
            spans[i].classList.add("speaking")
            break;
        }
    }
    audioSource.addEventListener("ended", (e) => {
        speaking = false
        spans[i].classList.remove("speaking")
        audioSource.disconnect(audioCtx.destination)
        processTtsQueue()
    })
}

function runWorker(worker, cmd, ...args) {
    let id = _id++
    if (cmd) worker.postMessage({ cmd: cmd, args: args, id: id })
    return new Promise((resolve, reject) => {
        const onMessage = (e) => {
            if (cmd && e.data.id != id) return
            cleanup()
            resolve(e.data)
        }
        const onError = (err) => {
            if (cmd && err.data.id != id) return
            cleanup()
            reject(err)
        }
        const cleanup = () => {
            worker.removeEventListener('message', onMessage)
            worker.removeEventListener('error', onError)
        }

        worker.addEventListener('message', onMessage)
        worker.addEventListener('error', onError)
    })
}

function logMessage(message) {
    let parts = splitSentences(message.content)
    let html = ""
    for (let part of parts) html += `<span class="sentence">${escape(part)}</span>`
    log(html, message.role, true)
    chat.push(message)
}

function log(str, src, html) {
    let el = document.createElement("p")
    el.textContent = str
    if (html) el.innerHTML = str
    if (src) {
        el.classList.add(src)
        el.innerHTML = `<strong>${src}:</strong> ` + el.innerHTML
    }
    $("#log").appendChild(el)
    window.scrollBy(0, 1024)
}


function escape(txt) {
    _div.textContent = txt
    return _div.innerHTML
}

function $(selector) {
    return document.querySelector(selector)
}
function $$(selector) {
    return document.querySelectorAll(selector)
}

let _id = 1
let _div = document.createElement("div")
init()
