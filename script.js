import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5";

let llm, tts;
let chat = [];

let audioCtx, speaking;
let ttsQueue = [];

async function init() {
    document.body.addEventListener("click", initAudio);
    $("form").addEventListener("submit", userSubmit);

    logMessage({ role: "system", content: "You are a happy little boy." });
    logMessage({ role: "user", content: "Hello there!" });
    think();
}

function initAudio(e) {
    if (!audioCtx) audioCtx = new AudioContext();
    if (e) {
        let osc = audioCtx.createOscillator();
        osc.connect(audioCtx.destination);
        osc.start();
        setTimeout((e) => {
            osc.stop();
        }, 32);
        document.body.removeEventListener("click", initAudio);
    }
}
async function initLLM() {
    if (llm) return;
    $("#llmStatus").classList.remove("busy");
    $("#llmStatus").classList.add("init");
    llm = await pipeline(
        "text-generation",
        "HuggingFaceTB/SmolLM2-360M-Instruct",
        {
            device: "webgpu",
            dtype: "q4f16"
        }
    );
    $("#llmStatus").classList.remove("init");
    $("#llmStatus").classList.add("idle");
}

async function initTTS() {
    if (tts) return;
    $("#ttsStatus").classList.remove("busy");
    $("#ttsStatus").classList.add("init");
    tts = await pipeline("text-to-speech", "Xenova/speecht5_tts", {
        // device: "webgpu",
        quantized: false
    });
    // let audioSource = await speak("tts ready");
    // document.body.addEventListener("click", (e) => {
    //   console.log("ready", audioSource);
    //   audioSource.start();
    // });
    $("#ttsStatus").classList.remove("init");
    $("#ttsStatus").classList.add("idle");
}

function userSubmit(e) {
    e.preventDefault();
    let userTxt = $("#userInp").value;
    let message = {
        role: "user",
        content: userTxt
    };
    logMessage(message);
    think();
    $("#userInp").value = "";
}

async function think() {
    await initLLM();
    $("#llmStatus").classList.add("busy");
    let result = await llm(chat, {
        max_new_tokens: 128,
        do_sample: true
    });
    $("#llmStatus").classList.remove("busy");
    let message = result[0].generated_text.pop();
    logMessage(message);
    // $("#userInp").focus();
    await speak(message.content);
}

async function speak(txt) {
    if (!$("#ttsEnabled").checked) return;
    await initTTS();

    $("#ttsStatus").classList.add("busy");
    let sentences = splitSentences(txt);
    let speaker_embeddings =
        "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";
    for (let sentence of sentences) {
        if (!sentence.trim()) continue;
        let speech = await tts(sentence.trim(), { speaker_embeddings });
        speech.text = sentence.trim();
        console.log("Queuing:", speech.text);
        ttsQueue.push(speech);
        processTtsQueue();
    }
    $("#ttsStatus").classList.remove("busy");
}

function splitSentences(txt) {
    let sentences = [""];
    let quot,
        wrap,
        parens = 0;
    for (let char of txt) {
        sentences[sentences.length - 1] = (
            sentences[sentences.length - 1] + char
        ).trimStart();
        if (quot || parens) {
            switch (char) {
                case quot:
                    quot = null;
                    break;
                case "(":
                    parens++;
                    break;
                case ")":
                    parens--;
                    break;

                case ".":
                case "!":
                case "?":
                case ":":
                case ";":
                    wrap = true;
                    break;
            }
            if (wrap && !(quot || parens)) {
                sentences.push("");
                wrap = false;
            }
        } else {
            switch (char) {
                case '"':
                case "'":
                    quot = char;
                    if (sentences[sentences.length - 1].slice(-2).trim().length > 1)
                        quot = null;
                    break;

                case "(":
                    parens++;
                    break;

                case ".":
                case "!":
                case "?":
                case ":":
                case ";":
                    if (sentences[sentences.length - 1] == char)
                        sentences[sentences.length - 2] += sentences.pop();
                    sentences.push("");
                    break;
            }
        }
    }
    if (!sentences[sentences.length - 1].trim()) sentences.pop();
    return sentences;
}

function processTtsQueue() {
    if (speaking) return;
    if (ttsQueue.length == 0) return;
    let speech = ttsQueue.shift();

    initAudio();
    speaking = true;
    let audioBuffer = audioCtx.createBuffer(
        1,
        speech.audio.length,
        speech.sampling_rate
    );
    audioBuffer.copyToChannel(speech.audio, 0);
    let audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioCtx.destination);
    audioSource.start();
    audioSource.addEventListener("ended", (e) => {
        speaking = false;
        audioSource.disconnect(audioCtx.destination);
        processTtsQueue();
    });
}

function logMessage(message) {
    log(message.content, message.role);
    chat.push(message);
}

function log(str, src) {
    let el = document.createElement("p");
    el.textContent = str;
    if (src) {
        el.classList.add(src);
        el.innerHTML = `<strong>${src}:</strong> ` + el.innerHTML;
    }
    $("#log").appendChild(el);
    window.scrollBy(0, 1024);
}

function $(selector) {
    return document.querySelector(selector);
}
function $$(selector) {
    return document.querySelectorAll(selector);
}

init();
