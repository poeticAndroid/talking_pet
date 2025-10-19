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
            this.print(message + "\n")
            this.finishLastSentence()
        } else if (message.success === false) {
            this.print("ERR! " + (message.status?.stack || JSON.stringify(message.status, null, 2)), "error", message.id)
            this.finishLastSentence()
        } else if (message.token) {
            this.print(message.token, message.role || "assistant", message.id)
        } else if (message.id) {
            if (message[0]?.generated_text) {
                message = {
                    content: message[0].generated_text.pop()?.content,
                    role: message.role || "assistant",
                    id: message.id
                }
            }
            if (!this.print("", message.role, message.id).textContent)
                this.print(message.content, message.role, message.id)
            this.finishLastSentence(message.role)
            this.messages.push(message)
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
        let el = this.container.querySelector(`#message_${message.id}`)
        el?.parentElement.removeChild(el)
        el = this.log(html, message.role, true)
        el.id = `message_${message.id}`
        this.messages.push(message)
        return sentences
    }

    splitSentences(txt) {
        if (!txt) return []
        let sentences = [""]
        for (let char of txt) {
            sentences[sentences.length - 1] += char

            switch (char) {
                case ".":
                case "!":
                case "?":
                case ":":
                case ";":
                case "~":
                    if (sentences[sentences.length - 1] == char)
                        sentences[sentences.length - 2] += sentences.pop()
                    sentences.push("")
                    break;
            }
        }

        if (!sentences[sentences.length - 1]) sentences.pop()
        return sentences
    }

    log(str, src, html) {
        let el = document.createElement("pre")
        el.textContent = str
        if (html) el.innerHTML = str
        if (src) el.classList.add(src)
        this.container.appendChild(el)
        setTimeout(() => { el.scrollIntoView(true) })
        return el
    }

    print(content, role, id) {
        if (!this.container) return;
        let el = id ? this.container.querySelector(`#message_${id}`) : this.lastText
        if (!el) {
            this.lastText = null
            el = document.createElement("pre")
            if (role) el.classList.add(role)
            if (id) el.id = `message_${id}`
            if (!(role || id)) this.lastText = el
            this.container.appendChild(el)
        }

        let lastSentence
        for (let sentence of el.querySelectorAll(`.sentence`)) {
            if (lastSentence && !lastSentence.id) {
                let id = _id++
                lastSentence.id = `sentence_${id}`
                if (role == "assistant" && this.pipes.length) this.outbox.push({ id: id, input: lastSentence.textContent })
                else lastSentence.classList.replace("unread", "read")
            }
            lastSentence = sentence
        }
        if (!lastSentence) {
            lastSentence = document.createElement("span")
            lastSentence.setAttribute("class", "sentence unread")
            el.appendChild(lastSentence)
        }

        lastSentence.textContent += content
        lastSentence.scrollIntoView(true)
        lastSentence.outerHTML = '<span class="sentence unread">' + this.splitSentences(lastSentence.textContent)
            .map(s => this.escape(s)).join('</span><span class="sentence unread">') + '</span>'

        return el
    }

    finishLastSentence(role) {
        for (let sentence of this.container.querySelectorAll(`.sentence`)) {
            if (sentence && !sentence.id) {
                let id = _id++
                sentence.id = `sentence_${id}`
                this.outbox.push({ id: id, input: sentence.textContent })
            }
        }
        if (!(role == "assistant" && this.pipes.length)) {
            this.outbox = []
            this.readAll()
        }
    }

    escape(txt) {
        _div.textContent = txt
        return _div.innerHTML
    }
}

let _id = 1
let _div = document.createElement("div")
