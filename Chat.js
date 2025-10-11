import Queue from "./Queue.js"

export default class Chat extends Queue {
    messages = []
    container = null
    lastText

    constructor(container = this.container) {
        super()
        this.container = container
    }

    process(message) {
        // console.log("Chat got:", message)
        if (typeof message == "string") {
            if (this.lastText) this.lastText.innerHTML += '<br/>' + this.escape(message)
            else this.lastText = this.log(message)
            setTimeout(() => { this.lastText = null }, 1024)
        } else {
            this.lastText = null
            if (message.success) {
                let id = message.id
                message = message[0].generated_text.pop()
                message.id = id
            }
            if (message.success === false) {
                message.role = "error"
                message.content = message.status?.stack || JSON.stringify(message.status, null, 2)
            }
            let sentences = this.logMessage(message)
            if (message.role == "assistant" && this.pipes.length)
                sentences.forEach(sentence => {
                    this.outbox.push(sentence)
                })
        }
    }

    pop() {
        let message = this.messages.pop()
        if (!message) return;
        if (this.container) {
            let el
            do {
                el = this.container.lastElementChild
                this.container.removeChild(el)
            } while (el.id != "message_" + message.id)
        }
        return message
    }

    shutdown() {
        if (!this.container) return super.shutdown();
        let unread = this.container.querySelector(".unread")
        if (!unread) return super.shutdown();
        let messageEl = unread.parentElement
        if (unread.classList.contains("speaking")) {
            unread.textContent = unread.textContent.slice(0, Math.round(unread.textContent.length / 2)) + "..."
            unread.classList.replace("unread", "read")
        }
        messageEl.querySelectorAll(".unread").forEach(el => el.parentElement.removeChild(el))

        let message = this.messages[this.messages.length - 1]
        while (messageEl.id != "message_" + message.id) {
            this.pop()
            message = this.messages[this.messages.length - 1]
        }

        message.content = messageEl.textContent.slice(messageEl.textContent.indexOf(":") + 1).trim()

        return super.shutdown()
    }

    readAll() {
        if (!this.container) return;
        this.container.querySelectorAll(".unread").forEach(el => {
            el.classList.remove("unread")
            el.classList.remove("rendering")
            el.classList.remove("queued")
            el.classList.remove("speaking")
            el.classList.add("read")
        })
    }

    logMessage(message) {
        message.id = message.id || _id++
        let sentences = this.splitSentences(message.content).map(text => ({ id: _id++, input: text }))
        let html = ""
        for (let sentence of sentences) html += `<span id="sentence_${sentence.id}" class="sentence ${(message.role == "assistant" && this.pipes.length) ? "unread" : "read"}">${this.escape(sentence.input)}</span>`
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
