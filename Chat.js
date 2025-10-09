import Queue from "./Queue.js"

export default class Chat extends Queue {
    messages = []
    container = null

    constructor(container = this.container) {
        super()
        this.container = container
    }

    process(message) {
        // console.log("Chat got:", message)
        if (typeof message == "string") {
            this.log(message)
        } else {
            if (message.success) {
                let id = message.id
                message = message[0].generated_text.pop()
                message.id = id
            }
            let sentences = this.logMessage(message)
            if (message.role == "assistant")
                sentences.forEach(sentence => {
                    this.outbox.push(sentence)
                })
        }
    }

    pop() {
        let message = this.messages.pop()
        this.container?.querySelector("#message_" + message?.id)?.parentNode.removeChild(this.container?.querySelector("#message_" + message?.id))
        return message
    }

    logMessage(message) {
        message.id = message.id || _id++
        let sentences = this.splitSentences(message.content).map(text => ({ id: _id++, input: text }))
        let html = ""
        for (let sentence of sentences) html += `<span id="sentence_${sentence.id}" class="sentence ${message.role == "assistant" ? "unread" : ""}">${this.escape(sentence.input)}</span>`
        let el = this.log(html, message.role, true)
        el.id = `message_${message.id}`
        this.messages.push(message)
        return sentences
    }

    splitSentences(txt) {
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

    log(str, src, html) {
        let el = document.createElement("p")
        el.textContent = str
        if (html) el.innerHTML = str
        if (src) {
            el.classList.add(src)
            el.innerHTML = `<strong>${src}:</strong> ` + el.innerHTML
        }
        this.container.appendChild(el)
        el.scrollIntoView(true)
        return el
    }

    escape(txt) {
        _div.textContent = txt
        return _div.innerHTML
    }
}

let _id = 1
let _div = document.createElement("div")
