import path from 'node:path'
import type { Plugin } from 'vite'

const getHashFileName = (id: string) => `assets/${path.basename(id, '.html')}.hash`
const getupdaterFileName = (id: string) => `assets/${path.basename(id, '.js')}.updater.js`

export interface Options {
  interval?: number
  confirmText?: string
  forceUpdate?: boolean
}

export default function autoUpdaterPlugin(options?: Options): Plugin {
  const { interval = 1000 * 60 * 10, confirmText = '检测到新版本发布，是否刷新页面？', forceUpdate } = options ?? {}

  const processedHtml: string[] = []
  let base = '/'

  return {
    name: 'vite-plugin-auto-updater',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml(html, { filename, bundle }) {
      let hashFileName = ''

      if (bundle) {
        const bundles = Object.values(bundle)

        const chunk = bundles.find(
          (chunk) => chunk.type === 'chunk' && chunk.isEntry && chunk.facadeModuleId === filename
        )

        if (chunk) {
          hashFileName = chunk.fileName
        }
      }

      if (!hashFileName) return html
      processedHtml.push(filename)

      return html.replace(
        '</body>',
        `  <script async src="${base.endsWith('/') ? base : `${base}/`}${getupdaterFileName(hashFileName)}"></script>
  </body>`
      )
    },
    generateBundle(_, bundle) {
      const bundles = Object.values(bundle)

      processedHtml.forEach((id) => {
        const chunk = bundles.find((chunk) => chunk.type === 'chunk' && chunk.isEntry && chunk.facadeModuleId === id)

        if (chunk) {
          const hash = chunk.fileName.match(/-(\w+).js$/)?.[1]

          if (hash) {
            this.emitFile({
              fileName: getHashFileName(id),
              type: 'asset',
              source: hash,
            })

            this.emitFile({
              fileName: getupdaterFileName(chunk.fileName),
              type: 'asset',
              source: `(function () {
  var timer = null
  var pending = false
  var hash = null
  var multiple = 1
  function check() {
    if (pending) return
    pending = true
    clearTimeout(timer)
    fetch('${base.endsWith('/') ? base : `${base}/`}${getHashFileName(id)}')
    .then(function (res) { return res.text() })
    .then(function (res) {
      if (hash !== null && hash !== res) {
        ${
          forceUpdate
            ? 'location.reload()'
            : `if (confirm("${confirmText}")) {
          location.reload()
        } else {
          multiple = Math.min(multiple + 1, 4)
        }`
        }
      } else {
        hash = res
      }
    }).finally(function () {
      pending = false
      timer = setTimeout(function () { check() }, ${interval} * multiple)
    })
  }
  window.addEventListener('error', function (e) {
    if (/^(link|script)$/i.test(e.target.tagName)) {
      check()
    }
  }, true)
  requestIdleCallback(check)
})()
`,
            })
          }
        }
      })
    },
  }
}
