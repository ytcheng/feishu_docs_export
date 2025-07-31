// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

/**
 * Make HTTP requests with the Rust backend.
 *
 * ## Security
 *
 * This API has a scope configuration that forces you to restrict the URLs that can be accessed using glob patterns.
 *
 * For instance, this scope configuration only allows making HTTP requests to all subdomains for `tauri.app` except for `https://private.tauri.app`:
 * ```json
 * {
 *   "permissions": [
 *     {
 *       "identifier": "http:default",
 *       "allow": [{ "url": "https://*.tauri.app" }],
 *       "deny": [{ "url": "https://private.tauri.app" }]
 *     }
 *   ]
 * }
 * ```
 * Trying to execute any API with a URL not configured on the scope results in a promise rejection due to denied access.
 *
 * @module
 */

import { Channel, invoke } from '@tauri-apps/api/core'

/**
 * 兼容非ISO-8859-1字符的Headers实现类
 * 提供与浏览器Headers接口相同的API，但支持UTF-8编码的header值
 */
export class CompatibleHeaders {
    private _headers: Map<string, string[]> = new Map()

    /**
     * 构造函数，支持多种初始化方式
     * @param init - 可以是Headers对象、对象字面量或二维数组
     */
    constructor(init?: HeadersInit | CompatibleHeaders) {
        if (init) {
            if (init instanceof CompatibleHeaders) {
                // 从另一个CompatibleHeaders实例复制
                this._headers = new Map(init._headers)
            } else if (init instanceof Headers) {
                // 从浏览器Headers对象复制
                for (const [name, value] of init.entries()) {
                    this._normalizeAndSet(name, value)
                }
            } else if (Array.isArray(init)) {
                // 从二维数组初始化
                for (const [name, value] of init) {
                    this._normalizeAndSet(name, value)
                }
            } else {
                // 从对象字面量初始化
                for (const [name, value] of Object.entries(init)) {
                    this._normalizeAndSet(name, value)
                }
            }
        }
    }

    /**
     * 标准化header名称并设置值
     * @param name - header名称
     * @param value - header值
     */
    private _normalizeAndSet(name: string, value: string): void {
        const normalizedName = this._normalizeName(name)
        this._validateName(normalizedName)
        this._validateValue(value)
        
        if (!this._headers.has(normalizedName)) {
            this._headers.set(normalizedName, [])
        }
        this._headers.get(normalizedName)!.push(value.trim())
    }

    /**
     * 标准化header名称（转为小写）
     * @param name - 原始header名称
     * @returns 标准化后的名称
     */
    private _normalizeName(name: string): string {
        return name.toLowerCase().trim()
    }

    /**
     * 验证header名称是否有效
     * @param name - header名称
     */
    private _validateName(name: string): void {
        if (!name || !/^[a-zA-Z0-9!#$&'*+\-.^_`|~]+$/.test(name)) {
            throw new TypeError(`Invalid header name: ${name}`)
        }
    }

    /**
     * 验证header值是否有效
     * @param value - header值
     */
    private _validateValue(value: string): void {
        // 允许UTF-8字符，只检查控制字符
        if (/[\x00-\x08\x0A-\x1F\x7F]/.test(value)) {
            throw new TypeError(`Invalid header value`)
        }
    }

    /**
     * 添加新的header值，如果header已存在则追加
     * @param name - header名称
     * @param value - header值
     */
    append(name: string, value: string): void {
        this._normalizeAndSet(name, value)
    }

    /**
     * 删除指定的header
     * @param name - header名称
     */
    delete(name: string): void {
        const normalizedName = this._normalizeName(name)
        this._headers.delete(normalizedName)
    }

    /**
     * 获取指定header的值（多个值用逗号分隔）
     * @param name - header名称
     * @returns header值或null
     */
    get(name: string): string | null {
        const normalizedName = this._normalizeName(name)
        const values = this._headers.get(normalizedName)
        return values ? values.join(', ') : null
    }

    /**
     * 获取指定header的所有值数组
     * @param name - header名称
     * @returns 值数组
     */
    getSetCookie(): string[] {
        const values = this._headers.get('set-cookie')
        return values ? [...values] : []
    }

    /**
     * 检查是否包含指定的header
     * @param name - header名称
     * @returns 是否存在
     */
    has(name: string): boolean {
        const normalizedName = this._normalizeName(name)
        return this._headers.has(normalizedName)
    }

    /**
     * 设置header值，如果已存在则覆盖
     * @param name - header名称
     * @param value - header值
     */
    set(name: string, value: string): void {
        const normalizedName = this._normalizeName(name)
        this._validateName(normalizedName)
        this._validateValue(value)
        this._headers.set(normalizedName, [value.trim()])
    }

    /**
     * 遍历所有header键值对
     * @param callback - 回调函数
     */
    forEach(callback: (value: string, name: string, headers: CompatibleHeaders) => void): void {
        for (const [name, values] of this._headers.entries()) {
            callback(values.join(', '), name, this)
        }
    }

    /**
     * 返回所有header键值对的迭代器
     */
    *entries(): IterableIterator<[string, string]> {
        for (const [name, values] of this._headers.entries()) {
            yield [name, values.join(', ')]
        }
    }

    /**
     * 返回所有header名称的迭代器
     */
    *keys(): IterableIterator<string> {
        for (const name of this._headers.keys()) {
            yield name
        }
    }

    /**
     * 返回所有header值的迭代器
     */
    *values(): IterableIterator<string> {
        for (const values of this._headers.values()) {
            yield values.join(', ')
        }
    }

    /**
     * 使对象可迭代
     */
    [Symbol.iterator](): IterableIterator<[string, string]> {
        return this.entries()
    }

    /**
     * 转换为普通对象
     * @returns 包含所有header的对象
     */
    toObject(): Record<string, string> {
        const obj: Record<string, string> = {}
        for (const [name, value] of this.entries()) {
            obj[name] = value
        }
        return obj
    }

    /**
     * 转换为二维数组格式
     * @returns header的二维数组表示
     */
    toArray(): Array<[string, string]> {
        return Array.from(this.entries())
    }
}

/**
 * Configuration of a proxy that a Client should pass requests to.
 *
 * @since 2.0.0
 */
export interface Proxy {
    /**
     * Proxy all traffic to the passed URL.
     */
    all?: string | ProxyConfig
    /**
     * Proxy all HTTP traffic to the passed URL.
     */
    http?: string | ProxyConfig
    /**
     * Proxy all HTTPS traffic to the passed URL.
     */
    https?: string | ProxyConfig
}

export interface ProxyConfig {
    /**
     * The URL of the proxy server.
     */
    url: string
    /**
     * Set the `Proxy-Authorization` header using Basic auth.
     */
    basicAuth?: {
        username: string
        password: string
    }
    /**
     * A configuration for filtering out requests that shouldn't be proxied.
     * Entries are expected to be comma-separated (whitespace between entries is ignored)
     */
    noProxy?: string
}

/**
 * Options to configure the Rust client used to make fetch requests
 *
 * @since 2.0.0
 */
export interface ClientOptions {
    /**
     * Defines the maximum number of redirects the client should follow.
     * If set to 0, no redirects will be followed.
     */
    maxRedirections?: number
    /** Timeout in milliseconds */
    connectTimeout?: number
    /**
     * Configuration of a proxy that a Client should pass requests to.
     */
    proxy?: Proxy
    /**
     * Configuration for dangerous settings on the client such as disabling SSL verification.
     */
    danger?: DangerousSettings
}

/**
 * Configuration for dangerous settings on the client such as disabling SSL verification.
 *
 * @since 2.3.0
 */
export interface DangerousSettings {
    /**
     * Disables SSL verification.
     */
    acceptInvalidCerts?: boolean
    /**
     * Disables hostname verification.
     */
    acceptInvalidHostnames?: boolean
}

const ERROR_REQUEST_CANCELLED = 'Request cancelled'

/**
 * Fetch a resource from the network. It returns a `Promise` that resolves to the
 * `Response` to that `Request`, whether it is successful or not.
 *
 * @example
 * ```typescript
 * const response = await fetch("http://my.json.host/data.json");
 * console.log(response.status);  // e.g. 200
 * console.log(response.statusText); // e.g. "OK"
 * const jsonData = await response.json();
 * ```
 *
 * @since 2.0.0
 */
export async function fetch(
    input: URL | Request | string,
    init?: RequestInit & ClientOptions
): Promise<Response> {
    // abort early here if needed
    const signal = init?.signal
    if (signal?.aborted) {
        throw new Error(ERROR_REQUEST_CANCELLED)
    }

    const maxRedirections = init?.maxRedirections
    const connectTimeout = init?.connectTimeout
    const proxy = init?.proxy
    const danger = init?.danger

    // Remove these fields before creating the request
    if (init) {
        delete init.maxRedirections
        delete init.connectTimeout
        delete init.proxy
        delete init.danger
    }

    const headers = init?.headers
        ? init.headers instanceof Headers
            ? init.headers
            : new Headers(init.headers)
        : new Headers()

    const req = new Request(input, init)
    const buffer = await req.arrayBuffer()
    const data =
        buffer.byteLength !== 0 ? Array.from(new Uint8Array(buffer)) : null

    // append new headers created by the browser `Request` implementation,
    // if not already declared by the caller of this function
    for (const [key, value] of req.headers) {
        if (!headers.get(key)) {
            headers.set(key, value)
        }
    }

    const headersArray =
        headers instanceof Headers
            ? Array.from(headers.entries())
            : Array.isArray(headers)
                ? headers
                : Object.entries(headers)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mappedHeaders: Array<[string, string]> = headersArray.map(
        ([name, val]) => [
            name,
            // we need to ensure we have all header values as strings
            // eslint-disable-next-line
            typeof val === 'string' ? val : (val as any).toString()
        ]
    )

    // abort early here if needed
    if (signal?.aborted) {
        throw new Error(ERROR_REQUEST_CANCELLED)
    }

    const rid = await invoke<number>('plugin:http|fetch', {
        clientConfig: {
            method: req.method,
            url: req.url,
            headers: mappedHeaders,
            data,
            maxRedirections,
            connectTimeout,
            proxy,
            danger
        }
    })

    const abort = () => invoke('plugin:http|fetch_cancel', { rid })

    // abort early here if needed
    if (signal?.aborted) {
        // we don't care about the result of this proimse
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        abort()
        throw new Error(ERROR_REQUEST_CANCELLED)
    }

    signal?.addEventListener('abort', () => void abort())

    interface FetchSendResponse {
        status: number
        statusText: string
        headers: [[string, string]]
        url: string
        rid: number
    }

    const {
        status,
        statusText,
        url,
        headers: responseHeaders,
        rid: responseRid
    } = await invoke<FetchSendResponse>('plugin:http|fetch_send', {
        rid
    })

    // no body for 101, 103, 204, 205 and 304
    // see https://fetch.spec.whatwg.org/#null-body-status
    const body = [101, 103, 204, 205, 304].includes(status)
        ? null
        : new ReadableStream({
            start: (controller) => {
                const streamChannel = new Channel<ArrayBuffer | number[]>()
                streamChannel.onmessage = (res: ArrayBuffer | number[]) => {
                    // close early if aborted
                    if (signal?.aborted) {
                        controller.error(ERROR_REQUEST_CANCELLED)
                        return
                    }

                    const resUint8 = new Uint8Array(res)
                    const lastByte = resUint8[resUint8.byteLength - 1]
                    const actualRes = resUint8.slice(0, resUint8.byteLength - 1)

                    // close when the signal to close (last byte is 1) is sent from the IPC.
                    if (lastByte == 1) {
                        controller.close()
                        return
                    }

                    controller.enqueue(actualRes)
                }

                // run a non-blocking body stream fetch
                invoke('plugin:http|fetch_read_body', {
                    rid: responseRid,
                    streamChannel
                }).catch((e) => {
                    controller.error(e)
                })
            }
        })

    const res = new Response(body, {
        status,
        statusText
    })

    // Set `Response` properties that are ignored by the
    // constructor, like url and some headers
    //
    // Since url and headers are read only properties
    // this is the only way to set them.
    Object.defineProperty(res, 'url', { value: url })
    Object.defineProperty(res, 'headers', {
        value: new CompatibleHeaders(responseHeaders)
    })

    return res
}