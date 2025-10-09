export default class Queue {
    inbox = []
    outbox = []
    pipes = []
    listeners = []

    isInitialized = false
    isProcessing = false
    currentTask = null

    constructor() {
        this.notify = this.notify.bind(this)
    }

    queue(task) {
        this.inbox.push(task);
        this.emitEvent("statuschange")
        return this.notify()
    }

    clear() {
        this.inbox = []
        this.emitEvent("statuschange")
    }

    async restart() {
        this.isProcessing = true
        if (this.isInitialized) {
            this.isInitialized = false
            await this.shutdown()
            this.isProcessing = true
        }
        this.isInitialized = !!(await this.init())
        this.isProcessing = !this.isInitialized
        this.emitEvent("statuschange")
        setTimeout(this.notify)
        return this.isInitialized
    }

    async notify() {
        if (this.isProcessing) return false;
        if (this.inbox.length == 0) return false;
        if (!this.isInitialized) await this.restart()
        this.isProcessing = true
        let product
        try {
            this.currentTask = this.inbox.shift()
            this.emitEvent("statuschange")
            product = await this.process(this.currentTask)
            this.deliver(product)
        } catch (error) {
            this.isInitialized = false
            this.shutdown()
        }
        return product
    }

    async init() {
        this.isInitialized = true
        this.emitEvent("statuschange")
        return this.isInitialized
    }

    async process(task) {
        return task
        throw "process method not implemented!"
    }

    async shutdown() {
        this.isProcessing = false
        this.isInitialized = false
        this.clear()
        this.emitEvent("statuschange")
        return this.isInitialized
    }

    deliver(product) {
        if (product) this.outbox.push(product)
        if (this.pipes.length) {
            while (product = this.outbox.shift()) {
                for (let pipe of this.pipes) {
                    pipe.queue(product)
                }
            }
        }
        this.currentTask = null
        this.isProcessing = false
        if (this.inbox.length == 0) this.emitEvent("statuschange")
        setTimeout(this.notify)
    }

    pipeTo(queue) {
        if (this.pipes.indexOf(queue) < 0) this.pipes.push(queue)
        return queue
    }
    removePipeTo(queue) {
        if (this.pipes.indexOf(queue) >= 0) this.pipes.splice(this.pipes.indexOf(queue), 1)
    }

    addEventListener(event, listener) {
        if (event == "statuschange" && this.listeners.indexOf(listener) < 0) this.listeners.push(listener)
        return listener
    }
    removeEventListener(event, listener) {
        if (this.listeners.indexOf(listener) >= 0) this.listeners.splice(this.listeners.indexOf(listener), 1)
    }
    emitEvent(event) {
        for (let listener of this.listeners) {
            listener(this)
        }
    }
}