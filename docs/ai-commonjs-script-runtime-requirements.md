# AI CommonJS 脚本运行时需求文档

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 状态 | 待实现 |
| 适用模块 | 代码编辑器 AI `run_javascript` 工具 |
| 脚本标准 | 完整 CommonJS JavaScript 程序 |
| 本地目标环境 | Node.js 18 及以上 |
| 编辑器目标环境 | 隔离的浏览器 classic Web Worker |
| 最后更新 | 2026-07-24 |

本文档定义最终实现范围，不再区分第一版、第二版或后续版本。开发过程中新增能力不得突破本文档定义的安全边界；改变公开脚本协议、文件权限模型或依赖解析规则时，必须先更新本文档及验收场景。

## 2. 背景

当前 `run_javascript` 将 AI 提供的代码作为异步函数体执行：

```js
async function (input, runtime) {
  // AI 提供的代码
}
```

这种代码不是完整 JavaScript 程序，不能原样保存后通过以下命令运行：

```bash
node script.js
```

目标是将公开脚本协议改为完整 CommonJS JavaScript 程序。相同源码在本地 Node.js 中使用真实 Node 接口，在代码编辑器中使用名称和行为相近的隔离兼容接口。

## 3. 目标

运行时必须满足以下目标：

1. AI 可以直接执行一段完整 CommonJS 代码，或者执行工作区中的 CommonJS 文件。
2. 工作区脚本保存到本地后，可以在安装依赖的 Node.js 项目中直接运行。
3. 脚本使用 `require`、`process`、`fs`、`path`、`Buffer`、`fetch` 和 `WebAssembly` 等常见接口，不编写编辑器专用分支。
4. 执行前必须准备完整的虚拟 Node 环境，将入口脚本、相对模块、关联 `package.json`、已解析的 `node_modules` 包资源和声明的业务文件映射到同一个内存虚拟文件系统。
5. CommonJS 模块解析和虚拟 `fs` 的全部读写必须基于同一个虚拟文件系统，不得分别维护不可见的模块源码表和文件表。
6. AI 必须显式声明脚本可读取的业务文件以及允许回写工作区的文件或目录；声明可以使用不同于工作区路径的虚拟挂载路径。
7. 编辑器 Worker 不持有工作区文件系统句柄，只接收准备完成的虚拟 Node 环境快照。
8. `script_path` 模式默认根据脚本位置自动查找关联 `package.json` 和工作区已有的 `node_modules`，并将实际需要的依赖闭包装载到内存；常规调用不需要手动指定模块目录。
9. 非标准目录布局或 `code` 模式可以通过可选工具参数补充 `node_modules` 根目录、npm 依赖或 URL 依赖。
10. 文件回写必须具有事务语义，脚本失败、超时或输出校验失败时不得保留部分结果。
11. 编辑器中的脚本请求、依赖下载和外部资源下载必须复用现有 `network-adapter`，并支持普通 HTTP 请求、跨域 HTTP 请求、文件上传和文件下载。
12. 支持纯 JavaScript/WASM 图片处理、普通 WASM 以及 Python-on-WASM 运行时。
13. 不支持 Node 原生 `.node` 扩展及依赖真实操作系统进程、Socket 或线程的模块。
14. Worker 只包装一次入口脚本，通过入口脚本的 ECMAScript completion value 或 `module.exports` 获取根 Promise，不通过逐个异步 API 推断脚本是否完成。

## 4. 非目标

以下内容不属于实现范围：

- ESM 入口脚本及静态 `import`/`export` 语法。
- 向 Worker 暴露工作区文件系统、编辑器文件句柄或真实磁盘路径。
- 无条件复制整个工作区或整个 `node_modules`；只装载入口所需的模块闭包、包清单和包内资源。
- 在运行时自动执行 `npm install` 或修改工作区 `node_modules`。
- 执行 npm 的 `preinstall`、`install`、`postinstall`、`prepare` 等生命周期脚本。
- Node 原生 `.node` 扩展。
- `node:child_process`、真实 TCP/UDP、真实 TLS Socket、集群和 Worker Threads。
- 完整 Node.js 事件循环、操作系统信号和进程模型。
- 完整 WASI、WASM Threads 和操作系统调用。
- 对任意 Node npm 包的无条件兼容承诺。
- 在 CommonJS 运行时中另建一套绕过现有 `network-adapter` 的请求、代理或请求头处理实现。
- 将浏览器 Worker 描述为能够抵御所有恶意 JavaScript 的完整安全沙箱。
- 本文档中的文件上传和下载不包含现有 SFTP 工具；它们特指脚本通过 HTTP(S) 传输文件。

## 5. 公开工具协议

继续复用 `run_javascript` 工具。`code` 和 `script_path` 必须二选一。

```json
{
  "script_path": "scripts/process.js",
  "args": ["input.png", "output.png"],
  "dependencies": {},
  "input_files": [
    {
      "path": "assets/input.png",
      "mount_path": "input.png"
    }
  ],
  "output_files": [
    {
      "path": "generated/output.png",
      "mount_path": "output.png",
      "overwrite": true
    }
  ],
  "output_directories": [],
  "credentials": [],
  "timeout_ms": 30000
}
```

### 5.1 `code`

`code` 是完整 CommonJS 程序，不再是异步函数体。

正确示例：

```js
const path = require('node:path');

console.log(path.basename(process.argv[2]));
module.exports = {ok: true};
```

旧格式不再作为公开协议支持：

```js
return input.value * 2;
```

`code` 模式不使用固定虚拟位置。环境准备器必须先将源码物化为虚拟文件系统中的入口文件，再由准备结果提供：

```text
__filename    = preparedEnvironment.entryPath
__dirname     = dirname(preparedEnvironment.entryPath)
process.cwd() = preparedEnvironment.cwd
```

`entryPath` 必须是虚拟文件系统中实际存在的脚本文件，`cwd` 必须是其中实际存在的目录。具体目录由工作区上下文、模块查找起点和挂载结果决定；合成文件名及其所在目录属于环境准备器实现细节，公开协议不得依赖 `/workspace/.ai-script.js` 等固定路径。

### 5.2 `script_path`

`script_path` 是工作区相对路径。环境准备器读取文件的 `effective` 视图，使未保存的编辑器内容能够参与执行，并递归收集入口引用的工作区 JavaScript、JSON 和包资源。

```text
script_path = scripts/process.js
__filename    = preparedEnvironment.entryPath
__dirname     = dirname(preparedEnvironment.entryPath)
process.cwd() = preparedEnvironment.cwd
```

`entryPath` 是 `script_path` 经过工作区到虚拟文件系统路径映射后的结果，不要求固定挂载到 `/workspace/scripts/process.js`。相对 `require()` 基于动态 `__dirname`，相对 `fs` 路径基于动态 `process.cwd()`。

### 5.3 `args`

`args` 映射到：

```js
process.argv = [
  '/usr/bin/node',
  __filename,
  ...args,
];
```

### 5.4 `credentials`

`credentials` 只声明凭据名称。声明的值通过以下接口提供：

```js
process.env.API_TOKEN
```

未声明的环境变量不可见。缺失凭据使用空字符串，并在工具结果中返回 `missing_credentials`。

### 5.5 `dependencies`

`dependencies` 是可选的补充依赖声明，与 `package.json` 的 `dependencies` 语义对齐，并允许 URL 描述符。`script_path` 模式默认优先使用能够从脚本位置自动发现的工作区 `node_modules`，不要求重复声明已经安装的包。

```json
{
  "lodash": "4.17.21",
  "small-library": {
    "url": "https://example.com/small-library.js",
    "format": "auto",
    "integrity": "sha256-..."
  }
}
```

显式工具参数覆盖自动发现结果中的同名依赖，并在 Worker 启动前同样物化为虚拟文件系统中的包文件。该参数主要用于 `code` 模式、URL 模块、工作区尚未安装的纯 JavaScript/WASM 包或需要固定不同版本的场景。

### 5.6 文件挂载声明

`input_files` 的每一项只包含工作区路径和可选虚拟挂载路径：

```json
{
  "path": "assets/input.png",
  "mount_path": "runtime/input.png"
}
```

字段语义：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `path` | 是 | 工作区相对路径，读取 `effective` 视图 |
| `mount_path` | 否 | `/workspace` 下的虚拟路径；省略时与 `path` 相同 |

不再需要 `type` 和 `view`。文件始终以原始字节装载，文本或二进制解释由 `fs.readFile()` 的编码参数决定；工作区视图固定使用 `effective`。

`input_files` 默认只读。`output_files` 声明虚拟路径到工作区目标路径的回写映射：

```json
{
  "path": "generated/output.png",
  "mount_path": "runtime/output.png",
  "overwrite": true
}
```

`output_files.path` 是工作区回写目标，`mount_path` 是脚本实际读写的虚拟路径，省略时同样与 `path` 相同。文件格式不需要声明。只声明为输出的文件在虚拟文件系统中初始不存在，即使工作区目标已经存在也不会读取其原内容；`overwrite` 只控制成功提交时是否允许替换工作区目标。若同一工作区文件及挂载路径同时出现在 `input_files` 和 `output_files` 中，环境准备器将其合并为一个可读写挂载，用于原地修改并在成功后回写。

`output_directories` 使用相同的工作区路径和可选 `mount_path` 语义，允许脚本在声明的虚拟目录下创建动态文件。目录映射保留虚拟路径下的相对子路径，例如 `/workspace/results/a.json` 可以通过 `results` 到 `generated` 的目录映射回写为 `generated/a.json`。所有工作区回写都发生在脚本成功结束后的统一提交阶段。

### 5.7 `node_modules_paths`

`node_modules_paths` 是可选的工作区相对目录数组，仅用于自动发现无法覆盖的非标准布局：

```json
{
  "node_modules_paths": [
    "vendor/node_modules"
  ]
}
```

正常 `script_path` 调用不应传入该参数。环境准备器默认从入口目录开始按 Node.js 目录层级向上查找 `node_modules`。手动目录必须位于允许的工作区范围内，只读装载，且仍受依赖闭包、文件大小和总内存限制约束。

## 6. 脚本编写模型

脚本应当是可以直接由 Node.js 执行的 CommonJS 程序：

```js
const fs = require('node:fs/promises');
const path = require('node:path');
const image = require('image-library');

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (process.argv.includes('--help')) {
    console.log('Usage: node process.js <input> <output>');
    return;
  }

  const source = await fs.readFile(inputPath);
  const result = await image.process(source);
  await fs.writeFile(outputPath, result);
  console.log(`Generated ${path.basename(outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

对于异步脚本，`main().catch(...)` 应当是入口脚本最后一条有效表达式。该表达式返回的 Promise 是 Worker 判断入口执行完成的首选信号：

```js
async function main() {
  await doWork();
  return {ok: true};
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

也允许显式导出根 Promise：

```js
module.exports = main();
```

纯同步脚本继续直接导出普通值：

```js
module.exports = {result: 42};
```

所有需要等待的异步任务必须属于根 Promise 链并被正确 `await`。以下后台任务不保证在工具返回前完成：

```js
async function main() {
  fetch('https://example.com'); // 未await
}

main();
```

本地运行：

```bash
npm install
node scripts/process.js input.png output.png
```

编辑器运行时，脚本源码不增加环境判断。接口差异全部由 Worker 兼容层处理。

## 7. CommonJS 执行环境

Worker 必须提供：

```text
require
module
exports
__filename
__dirname
process
Buffer
console
fetch
WebAssembly
```

普通依赖模块继续使用同步 CommonJS 包装，不等待模块源码最后一条表达式：

```js
const executeDependency = new Function(
  'require',
  'module',
  'exports',
  '__filename',
  '__dirname',
  'process',
  'Buffer',
  stripShebang(source),
);
```

入口脚本单独使用能够返回 ECMAScript completion value 的包装。实现可以通过直接 `eval` 获取脚本最后一条表达式的值：

```js
const executeEntry = new Function(
  'require',
  'module',
  'exports',
  '__filename',
  '__dirname',
  'process',
  'Buffer',
  'console',
  'fetch',
  'WebAssembly',
  'source',
  'return eval(source);',
);
```

只有入口脚本捕获 completion value，依赖模块不得改变同步 `require()` 语义。

入口完成值处理顺序：

```js
const completion = executeEntry(...);
const exported = module.exports;

if (isThenable(completion)) {
  const resolved = await completion;
  result = resolved === undefined ? module.exports : resolved;
} else if (isThenable(exported)) {
  const resolved = await exported;
  result = resolved === undefined ? module.exports : resolved;
} else {
  result = exported;
}
```

这使以下常见 Node CLI 写法无需修改即可由 Worker 精确等待：

```js
async function main() {
  await doWork();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

如果 `main().catch(...)` 后还有其他语句，最后一条表达式不再是根 Promise，Worker 不保证能够等待 `main()`：

```js
main().catch(console.error);
console.log('started'); // completion value不再是main Promise
```

脚本中的 shebang 必须被忽略：

```js
#!/usr/bin/env node
```

模块缓存必须支持循环依赖，同一个模块在一次执行中最多求值一次。

## 8. 虚拟 Node 环境准备与依赖装载

### 8.1 环境准备器

Worker 启动前，主线程中的环境准备器必须完成以下工作：

```text
校验code或script_path及工具参数
确定虚拟入口路径、cwd和模块查找起点
规范化input_files、output_files和output_directories挂载路径
收集入口脚本及其相对JavaScript和JSON模块
收集关联package.json、锁文件和包内资源
自动发现工作区node_modules并解析依赖闭包
按需解析显式npm或URL依赖
读取所有已收集工作区文件的effective快照
生成虚拟文件条目、目录条目和工作区回写映射
使用准备结果初始化MemoryProvider和FileSystem
```

环境准备器是执行链路中唯一允许读取工作区文件系统的组件。准备完成后，Worker 只接收可序列化的虚拟环境快照，不得在执行期间回查工作区。

准备结果至少包含：

```js
{
  entryPath: '/workspace/scripts/process.js',
  cwd: '/workspace',
  files: [
    {
      path: '/workspace/scripts/process.js',
      bytes: new Uint8Array(),
      writable: false,
    },
  ],
  directories: [],
  moduleSearchPaths: [],
  writeBackMappings: [
    {
      virtualPath: '/workspace/output.png',
      workspacePath: 'generated/output.png',
      overwrite: true,
    },
  ],
}
```

`writeBackMappings` 由主线程保留，不作为内存文件系统访问工作区的能力。`MemoryProvider` 只接收规范化后的文件、目录和权限数据。

### 8.2 `package.json` 查找

`script_path` 模式从脚本目录向工作区根目录寻找最近的 `package.json` 作为入口包范围：

```text
scripts/tools/process.js
scripts/tools/package.json
scripts/package.json
package.json
```

最近的包范围用于判断 `type` 并提供依赖发现提示。`.js` 入口位于 `"type": "module"` 包范围时返回 `UNSUPPORTED_ESM_ENTRY`，`.cjs` 始终按 CommonJS 处理。

环境准备器可以读取并挂载以下关联元数据：

```text
package.json
package-lock.json
dependencies
optionalDependencies
devDependencies
exports
main
type
```

入口包范围的依赖字段用于补全静态分析无法识别的动态 `require()` 候选；是否能够执行仍以对应包是否已装载到虚拟文件系统为准。不得执行 `scripts` 中的任何命令。

`code` 模式由环境准备器根据准备好的虚拟目录、工作区上下文和模块查找起点选择合成入口路径及 `cwd`。`package.json` 和 `node_modules` 发现从该动态入口路径开始；没有可用工作区上下文时只使用已准备的虚拟文件和显式 `dependencies`。

### 8.3 工作区 `node_modules` 自动装载

正常调用不需要声明 `node_modules`。环境准备器从入口目录开始，按 Node.js 裸包解析顺序检查当前目录及各级父目录下的 `node_modules`：

```text
/workspace/scripts/tools/node_modules
/workspace/scripts/node_modules
/workspace/node_modules
```

准备器只装载执行所需的依赖闭包，而不是无条件复制整个目录：

1. 从入口和工作区相对模块中的静态 `require()` 字符串开始解析。
2. 裸包名按照调用模块所在目录逐级查找实际工作区 `node_modules`。
3. 找到包后，将该包的 `package.json`、JavaScript、JSON、WASM 及运行时可能通过 `__dirname` 或 `fs` 读取的包内资源映射到对应虚拟路径。
4. 继续解析包内静态 `require()` 和包清单声明的依赖，直到依赖闭包稳定。
5. 保留嵌套和提升后的 `node_modules` 层级，使同一包的不同版本能够按调用位置正确解析。

工作区路径与虚拟路径保持同一逻辑层级。例如工作区 `scripts/node_modules/image-library/index.js` 映射为 `/workspace/scripts/node_modules/image-library/index.js`。符号链接可以解析真实内容，但必须以允许的逻辑挂载路径暴露，且不得借此获得任意工作区读取能力。

本地包存在时不查询 registry、不重新下载，也不执行安装脚本。包不存在且没有显式补充依赖时返回 `MODULE_NOT_FOUND`。发现 `.node` 文件或包入口依赖原生扩展时返回 `UNSUPPORTED_NATIVE_MODULE`。

所有自动装载都受单文件大小、文件数量、依赖深度和虚拟文件系统总字节数限制。

### 8.4 手动模块目录与补充依赖

`node_modules_paths` 仅作为非标准布局的后备查找目录，并按参数顺序追加到标准 Node.js 查找路径之后。目录中的包仍然只按实际依赖闭包装载，不得把该参数解释为允许脚本浏览整个目录。

显式 `dependencies` 优先级高于自动发现的同名包。环境准备器必须用显式包替换入口依赖闭包中原本会选中的同名包，并将其物化到相同的逻辑解析位置，确保后续仍由普通虚拟 `node_modules` 查找规则命中。对于 npm 版本描述符，支持：

```text
1.2.3
^1.2.0
~1.2.0
```

只有显式补充依赖允许在 Worker 启动前查询 registry、解析 semver、下载 tarball、校验 integrity 并解压。下载后的包必须物化为 `/workspace` 下可由普通 Node.js 查找规则命中的只读文件，不得仅保存在模块解析器私有表中。

如果存在关联 `package-lock.json`，可以使用其中的精确版本、`resolved` 和 `integrity` 提高可重复性。依赖缓存键必须包含包名、精确版本和 integrity。不得执行安装脚本，也不得加载原生 `.node` 文件。

不支持以下远程依赖表达式：

```text
file:
workspace:
git:
GitHub shorthand
```

### 8.5 URL 依赖

URL 依赖描述符：

```json
{
  "legacy-library": {
    "url": "https://example.com/library.js",
    "format": "auto",
    "integrity": "sha256-..."
  }
}
```

支持格式：

```text
auto
commonjs
umd
iife
```

URL 内容必须在 Worker 启动前下载并映射为虚拟包文件。`auto` 按以下方式处理：

```text
注入module、exports、require
执行脚本
优先使用module.exports
没有导出时检查新增全局变量
无法唯一判断时返回possible_globals
```

纯 IIFE 可以显式指定：

```json
{
  "format": "iife",
  "global": "LegacyLibrary"
}
```

AI 不需要单独预检依赖。解析或执行失败时返回结构化错误，由 AI 修改参数并重试。

URL 映射属于编辑器执行元数据。为了让同一源码通过本地 Node.js 运行，本地项目必须在 `node_modules` 中安装能够由同一 `require(specifier)` 找到的依赖，或者在本地打包阶段将该依赖包含进脚本。原生 Node.js 不会根据编辑器工具参数解析 HTTP URL。

## 9. 模块解析

支持：

```js
require('node:path');
require('./helper.js');
require('./config.json');
require('image-library');
```

解析规则：

| 模块形式 | 来源 |
| --- | --- |
| `node:xxx` 或受支持的核心模块名 | 虚拟 Node 模块 |
| `./`、`../` | 相对于当前模块虚拟路径解析 |
| 裸包名 | 先从当前模块目录开始在虚拟文件系统中逐级查找 `node_modules`，再查找准备好的手动 `moduleSearchPaths` |
| JSON | 从虚拟文件系统读取并解析后作为 `module.exports` |

相对路径尝试：

```text
原路径
.js
.json
目录 package.json
目录 index.js
目录 index.json
```

包入口尝试：

```text
exports.require
exports.default
main
index.js
index.json
```

包入口、扩展名尝试和 `package.json` 读取都必须通过虚拟文件系统完成。模块解析器不得持有另一份只对 `require()` 可见的源码表。模块缓存以规范化虚拟路径为键，并继续支持循环依赖。

工作区相对模块属于程序代码，由环境准备器自动收集，不需要放入 `input_files`。通过 `fs` 读取的业务文件必须声明并挂载。

### 9.1 动态 require

同步 `require(variable)` 只能加载已经存在于虚拟文件系统中的模块。

```js
const moduleName = process.argv[2];
const plugin = require(moduleName);
```

如果 `moduleName` 已通过静态依赖闭包、关联 `package.json`、工具 `dependencies` 或手动 `node_modules_paths` 装载，则允许执行。未知模块返回：

```text
DYNAMIC_MODULE_NOT_PRELOADED
```

运行中的同步 `require()` 不得回读工作区或临时发起异步下载。

## 10. 内存文件系统 Provider

内存文件系统必须由 `MemoryProvider extends FileSystemProvider` 实现，并通过文件系统工厂注册为 `memory`。不得在脚本运行时中维护一套绕过 `FileSystemProvider` 的私有文件 Map 或另一套文件操作协议。

`FileSystemProvider` 只定义存储后端操作契约，抽象基类不提供通用 write/copy/move 实现。每个具体 Provider 必须按照自身后端语义实现所声明支持的能力。

`MemoryProvider` 只管理内存中的目录、字节文件、路径权限和版本，不直接读取工作区、解析 npm、创建 Worker 或提交 `FileSession`。准备完成后使用它构造对应 `FileSystem`。

一次脚本执行只使用一个内存 `FileSystem`：CommonJS 解析器、`node:fs`、`node:fs/promises`、包资源读取和 WASM 文件读取全部通过文件系统层访问，不直接调用 Provider。`FileSystem` 只负责路径规范化、策略校验和调度，不实现 Provider 未声明支持的 copy/move 行为。

Worker 不得获得工作区文件句柄。主线程只向 Worker 传递初始化完成的内存数据。

可见资源分为：

| 资源 | 权限 |
| --- | --- |
| 程序入口、工作区模块和关联清单 | 只读 |
| 工作区或补充 `node_modules` 包及包内资源 | 只读 |
| `input_files` | 只读 |
| `output_files` | 对声明的虚拟文件可读写；未同时作为输入时初始不存在 |
| 同时声明为输入和输出的文件 | 使用输入快照初始化，可读写并允许成功后回写 |
| `output_directories` | 在声明的虚拟目录下创建、修改或覆盖子文件 |
| 其他路径 | 不可见且不可写 |

支持常见接口：

```text
fs.readFile
fs.readFileSync
fs.writeFile
fs.writeFileSync
fs.stat
fs.statSync
fs.access
fs.existsSync
fs.readdir
fs.readdirSync
fs.mkdir
fs.mkdirSync
fs.copyFile
fs.copyFileSync
fs.cp
fs.cpSync
fs.rename
fs.renameSync
fs.unlink
fs.unlinkSync
fs.rm
fs.rmSync
fs.rmdir
fs.rmdirSync
```

这些 Node 接口映射到统一文件系统能力：

| Node 接口 | `FileSystemProvider` / `FileSystem` 能力 |
| --- | --- |
| `readFile` | `openRead`、`readBlob` |
| `writeFile` | `openWrite`、`write` |
| `stat`、`access` | `stat`、`checkAccess` |
| `readdir` | `list` |
| `mkdir` | `createDirectory` |
| `copyFile`、`cp` | `copy`、`copyFile` |
| `rename` | `move`、`rename` |
| `unlink`、`rm`、`rmdir` | `remove`、`unlink`、`removeDirectory` |

`MemoryProvider` 必须实现文件和目录 copy/move，并保证内存 move 原子提交。Browser Handle Provider 必须实现文件和目录 copy/move，并标记 `atomicMove=false`。GitHub Provider 必须实现非原子文件 copy/move；一次 move 由创建目标和删除源文件的多个提交组成。由于 Contents API 目录列表可能截断，GitHub 目录 copy/move 在采用完整 Git Tree 遍历前必须返回不支持错误。

二进制读取返回兼容的 `Buffer` 或 `Uint8Array`。文本编码至少支持 UTF-8。

路径规则：

```text
虚拟根目录为 /workspace
相对 fs 路径基于 process.cwd()
require 相对路径基于当前模块 __dirname
mount_path省略时使用工作区相对path
mount_path必须规范化到/workspace内
拒绝 NUL 字节
拒绝逃逸 /workspace
拒绝未声明的业务文件读取和输出写入
```

程序包可以通过 `__dirname` 和虚拟 `fs` 读取自己的只读资源，例如 `.wasm`、JSON、字典、模型或图片模板。

挂载冲突必须在 Worker 启动前失败。两个不同工作区来源不得占用同一虚拟路径；唯一例外是同一来源以相同挂载路径同时声明为输入和输出，此时合并为可读写文件。

脚本写入直接修改本次执行私有的虚拟文件系统快照，并由该实例记录脏文件，不再维护与虚拟文件树分离的 `pendingOutputs` 内容表。写入不会直接修改工作区。

脚本成功结束后，主线程只提取与 `writeBackMappings` 匹配的脏文件，重新校验路径、覆盖策略、单文件大小和累计大小，再一次性暂存到 `FileSession`。脚本失败、超时或校验失败时直接丢弃整个虚拟文件系统实例及其变更。没有回写映射的只读程序、依赖资源和临时虚拟内容永远不得落入工作区。

## 11. 网络接口

脚本优先使用标准 `fetch`：

```js
const response = await fetch(url, options);
```

本地 Node.js 使用原生 `fetch`。编辑器 Worker 使用受限实现，并返回标准 `Response`。

必须支持：

```text
HTTP和HTTPS
GET、HEAD、POST、PUT、PATCH、DELETE
请求头
字符串和二进制请求体
Response.text()
Response.json()
Response.arrayBuffer()
Response.body
重定向
超时
AbortSignal
```

编辑器中的全部网络能力必须复用现有 `frontend/src/shared/script-runtime/network-adapter.js`。脚本运行时只负责把同一个适配器实例提供给 `fetch`、`XMLHttpRequest` 和虚拟 `node:http`、`node:https`，不得复制代理 URL 改写、请求头过滤、重定向或直连回退逻辑。

`network-adapter` 统一负责：

```text
后端代理
跨域请求
请求数量限制
单次下载大小限制
累计下载大小限制
请求头处理
重定向限制
直连与代理选择
```

凭据模式、Authorization、请求头过滤及代理控制头的具体行为以 `network-adapter` 及后端代理实现为准，本文档不重复定义另一套规则。

依赖下载、外部脚本和 WASM 资源下载也必须通过 `network-adapter`，并纳入其网络限制及缓存策略。若需要新增网络能力，应扩展该适配器及其单元测试，不得在 CommonJS 运行时内增加私有实现。

运行时通过 `network-adapter` 提供以下接口：

```text
fetch
XMLHttpRequest
node:http
node:https
```

`WebSocket` 和直接网络 `importScripts` 不得绕过 `network-adapter`。跨环境可移植脚本应使用 `require`；外部 CommonJS/UMD/IIFE 脚本应由主线程通过适配器预下载并放入虚拟文件系统后再执行。

`network-adapter` 尚未支持的网络接口不得由运行时私自直连；需要支持时先扩展适配器。

## 12. 虚拟 Node 模块

必须支持：

```text
node:fs
node:fs/promises
node:path
node:url
node:buffer
node:util
node:events
node:stream
node:string_decoder
node:assert
node:querystring
node:crypto
process
```

可以提供基础客户端兼容：

```text
node:http
node:https
```

`node:http` 和 `node:https` 只需要将常用 `get`、`request` 转换为 `fetch`，不实现真实 Socket、Agent 和连接池语义。

`node:crypto` 至少支持：

```text
randomBytes
randomUUID
createHash
createHmac
timingSafeEqual
webcrypto
subtle
```

明确不支持：

```text
node:child_process
node:net
node:tls
node:dgram
node:cluster
node:worker_threads
原生 .node 扩展
```

## 13. WASM

不实现自定义 WASM 引擎。直接保留浏览器和 Node.js 原生的：

```text
WebAssembly.instantiate
WebAssembly.instantiateStreaming
WebAssembly.compile
WebAssembly.Module
WebAssembly.Instance
WebAssembly.Memory
```

脚本可以从文件读取 WASM：

```js
const fs = require('node:fs/promises');

const bytes = await fs.readFile('processor.wasm');
const result = await WebAssembly.instantiate(bytes, {});
```

也可以从网络加载：

```js
const result = await WebAssembly.instantiateStreaming(
  fetch('https://example.com/processor.wasm'),
  {},
);
```

执行器只需保证：

```text
虚拟 fs 返回正确二进制
fetch 返回标准 Response
包下载保留 .wasm 和相关资源
包内部可以只读访问自己的资源
```

支持纯 JavaScript、普通 WASM、JS 胶水代码加 WASM 的加密和图片处理模块。不支持依赖原生 `.node` 扩展的模块。

## 14. 执行生命周期

Worker 不通过枚举或包装所有异步 API 来推断入口是否完成。完成判断只使用入口 completion value 和 `module.exports`：

```text
入口completion value是Promise
  → await该Promise

入口completion value不是Promise，但module.exports是Promise
  → await module.exports

两者都不是Promise
  → 按同步脚本完成
```

`network-adapter`、虚拟 `fs` 和其他兼容接口仍然可以包装能力，但目的仅限于：

```text
权限隔离
输入输出和下载大小限制
请求代理
取消和超时
错误标准化
```

这些包装不得作为主要执行完成判断机制。

入口 Promise resolve 后，如果返回值不是 `undefined`，将该返回值作为工具结果；如果返回 `undefined`，读取最终 `module.exports`。

入口 Promise reject 且未被脚本捕获时，本次执行失败。脚本通过 `.catch()` 捕获错误并设置非零 `process.exitCode` 时，本次执行同样失败。

没有进入根 Promise 链的后台任务不保证完成：

```js
async function main() {
  fetch(url); // 未await，不属于根Promise完成条件
}

main();
```

超时后必须：

```text
终止 Worker
取消可取消的网络请求
丢弃本次虚拟文件系统实例及全部脏数据
返回 SCRIPT_TIMEOUT
```

`process.exit(code)` 应终止本次脚本执行并生成对应 `exit_code`。`exit_code=0` 时，已经完成且与回写映射匹配的虚拟文件变更可以进入最终校验和事务提交；`exit_code` 非零时本次执行视为失败，整个虚拟文件系统快照必须丢弃。尚未完成的异步写入在任何情况下都不得提交。

## 15. 执行结果

成功结果：

```json
{
  "ok": true,
  "exit_code": 0,
  "logs": [],
  "exports": {},
  "requested_credentials": [],
  "missing_credentials": [],
  "resolved_dependencies": {
    "image-library": {
      "version": "1.2.3",
      "source": "workspace",
      "virtual_path": "/workspace/node_modules/image-library"
    }
  },
  "network_requests": [],
  "files": []
}
```

`module.exports` 经过现有安全序列化规则后放入 `exports`。console 日志继续限制数量和字符串长度。

`files` 只返回成功提交或准备提交的声明输出，并同时包含虚拟路径和对应工作区路径；未映射的虚拟文件、程序文件和依赖文件不得出现在结果中。

错误结果必须包含稳定的错误码和必要上下文。至少定义：

```text
SCRIPT_REQUIRED
SCRIPT_TOO_LARGE
SCRIPT_TIMEOUT
SCRIPT_ERROR
WORKSPACE_REQUIRED
UNSUPPORTED_ESM_ENTRY
MODULE_NOT_FOUND
DYNAMIC_MODULE_NOT_PRELOADED
DEPENDENCY_RESOLVE_FAILED
DEPENDENCY_DOWNLOAD_FAILED
PACKAGE_INTEGRITY_MISMATCH
PACKAGE_ENTRY_NOT_FOUND
MODULE_EXPORT_NOT_FOUND
UNSUPPORTED_NODE_BUILTIN
UNSUPPORTED_NATIVE_MODULE
MOUNT_PATH_INVALID
MOUNT_PATH_CONFLICT
NODE_MODULES_PATH_INVALID
VFS_PATH_NOT_FOUND
VFS_PATH_READ_ONLY
OUTPUT_PATH_NOT_DECLARED
FILE_ALREADY_EXISTS
FILE_TOO_LARGE
REQUEST_LIMIT_EXCEEDED
REQUEST_TIMEOUT
```

依赖错误应包含 `specifier`、`parent` 和 `dependency_chain`。挂载错误应包含工作区路径、规范化后的虚拟路径和冲突来源，但不得泄露未声明文件的内容。

## 16. 旧函数体执行器

公开 `code` 模式不再支持旧函数体协议。

当前 `request_proxy.filter_script` 仍然依赖 `input` 和函数体返回值，因此保留私有内部执行器：

```text
runInternalFunctionBody
```

该执行器不得出现在公开 AI 工具定义中，不负责 CommonJS、npm 依赖或文件输出。

## 17. 隔离边界

必须保证：

1. Worker 不获得工作区后端 `FileSystemProvider`、`FileSession` 或浏览器文件句柄；Worker 内只允许根据快照创建隔离的 `MemoryProvider`。
2. CommonJS 解析器和虚拟 `fs` 只能访问同一个内存虚拟文件系统，不存在绕过挂载规则的第二条文件读取通道。
3. 脚本不能通过虚拟 `fs` 读取未挂载的业务文件，也不能写入只读的脚本、清单、输入文件或 `node_modules`。
4. 脚本只能在声明的 `output_files` 和 `output_directories` 虚拟路径内写入。
5. 只有显式 `writeBackMappings` 中的脏文件能够回写工作区，依赖和临时虚拟文件永不回写。
6. 输出在成功完成和主线程二次校验前不修改编辑器模型。
7. 自动发现 `node_modules` 只能由主线程环境准备器执行，并限制在实际依赖闭包内，不能把扫描能力传递给脚本。
8. 依赖安装脚本永不执行。
9. 凭据只通过显式 `credentials` 注入。
10. 任何脚本、依赖和 WASM 都受执行时间、请求数量、下载大小、文件数量、依赖深度、输入大小、输出大小和虚拟文件系统总内存限制。

浏览器 Worker 是执行隔离和文件能力隔离边界，不承诺完整抵御所有恶意 JavaScript。不能覆盖的浏览器原生能力不得被描述为已禁用。

## 18. 实现组织建议

建议新增：

```text
frontend/src/shared/script-runtime/
  node-environment-preparer.js
  commonjs-runtime.js
  commonjs-resolver.js
  dependency-resolver.js
  virtual-process.js
  worker-source.js

frontend/src/shared/file-system/providers/
  memory-provider.js
```

`node-environment-preparer.js` 中的 `NodeEnvironmentPreparer` 工具类负责：

```text
解析并校验工具参数
发现入口包范围和node_modules查找目录
收集脚本、相对模块、package.json、包文件和业务文件
规范化工作区路径到虚拟路径的映射
合并输入与输出权限并检测挂载冲突
生成MemoryProvider初始化参数和独立writeBackMappings
```

`memory-provider.js` 必须复用公共 `FileSystemProvider` 契约，只接受内存条目作为构造参数，并提供路径规范化、权限检查、文件及目录操作、版本前置条件、copy/move 和写入中止语义。它不得直接读取工作区、解析 npm、创建 Worker 或提交 `FileSession`。

`commonjs-resolver.js` 只依赖内存 `FileSystem`、只读的 `moduleSearchPaths` 配置和虚拟 Node 核心模块注册表。工作区包与补充包采用同一套 Provider 路径解析逻辑，不再需要独立的 `virtual-node-modules.js` 文件内容存储层。

现有 `frontend/src/shared/script-runtime/network-adapter.js` 必须直接复用。CommonJS 运行时只注入其 `fetch`、`XMLHttpRequest`、`http` 和 `https` 适配结果；新增限制或协议兼容应集中修改该文件及 `frontend/test/unit/network-adapter.test.js`。

`CodeEditorView.vue` 只负责：

```text
AI工具参数处理
调用Node环境准备器
创建及终止Worker
提取虚拟文件系统变更并二次校验
按writeBackMappings事务性暂存文件
返回工具结果
```

现有 `ai-javascript-runtime.js` 中的路径校验、大小限制、请求限制、错误序列化、结果安全序列化和输出收集逻辑应优先复用或迁移，不重复实现语义不同的副本。

## 19. 验收环境

自动化验收应提供确定性的测试资源：

```text
固定输入文本和二进制文件
固定PNG/JPEG图片
固定CommonJS和UMD依赖
固定WASM文件
固定Python-on-WASM发行物或兼容测试夹具
包含嵌套依赖和包内资源的固定工作区node_modules夹具
位于非标准目录的固定node_modules夹具
本地HTTP测试服务
不同origin的第二个HTTP测试服务
可返回无CORS响应的代理测试端点
仅用于显式补充依赖的固定npm registry测试镜像或可控包夹具
```

CI 不应依赖不稳定的公开互联网资源。外部依赖、图片模块和 Python-on-WASM 发行物应固定版本和 integrity，并可从测试资源服务器提供。

## 20. 验收场景

### AC-01 普通计算

执行模式：`code`

脚本执行斐波那契、数组聚合或大整数转换，不使用工作区和网络。

示例：

```js
const values = [1, 2, 3, 4, 5];
module.exports = {
  sum: values.reduce((total, value) => total + value, 0),
};
```

验收结果：

```text
ok=true
exit_code=0
exports.sum=15
files为空
不要求工作区
__filename、__dirname和process.cwd()来自准备后的虚拟环境
__filename指向实际存在的虚拟入口文件，不依赖固定路径
```

### AC-02 完整脚本和帮助输出

执行模式：`script_path`

脚本包含 shebang，并在收到 `--help` 时输出 Usage。

验收结果：

```text
shebang不会导致语法错误
process.argv包含--help
日志包含Usage
exit_code=0
```

同一文件在本地执行：

```bash
node script.js --help
```

应输出等价帮助内容。

### AC-03 同目录 JavaScript 模块

目录：

```text
scripts/main.js
scripts/helper.js
```

`main.js` 使用：

```js
const helper = require('./helper.js');
module.exports = helper.calculate(6, 7);
```

验收结果：

```text
不需要将helper.js放入input_files
helper.js在Worker启动前映射到虚拟文件系统
模块相对于main.js解析
模块源码由CommonJS解析器从虚拟文件系统读取
exports=42
模块只执行一次
```

### AC-04 工作区 `node_modules` 自动装载

工作区最近的 `package.json` 声明一个固定版本的纯 CommonJS 测试包，对应包和传递依赖已存在于 Node.js 正常可查找的工作区 `node_modules`。AI 调用不传 `dependencies` 或 `node_modules_paths`。

验收结果：

```text
自动读取最近package.json
按入口目录自动发现工作区node_modules
入口包、传递依赖、package.json和包内资源映射到虚拟文件系统
嵌套或提升依赖按调用模块位置正确解析
resolved_dependencies返回精确版本、workspace来源和虚拟路径
执行期间require和fs都只读取虚拟文件系统
不请求registry
不执行安装脚本
```

### AC-05 code 模式 URL 依赖

AI 在 `dependencies` 中提供一个 CommonJS 或 UMD URL，并在 `code` 中使用：

```js
const library = require('small-library');
module.exports = library.calculate(10);
```

验收结果：

```text
依赖在Worker启动前下载
依赖内容作为只读包文件映射到虚拟文件系统
下载计入大小和请求限制
module.exports被正确返回
重复require使用模块缓存
```

### AC-06 上传文件

执行模式：`script_path`

AI 声明一个 `input_file`，只提供工作区 `path` 和不同的 `mount_path`，不提供 `type` 或 `view`。脚本通过虚拟挂载路径调用 `fs.readFile()` 读取完整字节，并使用 `fetch` POST 到测试上传端点。

示例：

```js
const fs = require('node:fs/promises');

async function main() {
  const bytes = await fs.readFile(process.argv[2]);
  const response = await fetch(process.argv[3], {
    method: 'POST',
    headers: {'content-type': 'application/octet-stream'},
    body: bytes,
  });
  module.exports = await response.json();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

验收结果：

```text
服务端收到的字节与输入文件完全一致
服务端返回的size和sha256与本地夹具一致
mount_path省略和显式指定两种形式都能正确读取
文件类型由fs读取方式决定，不需要type参数
输入文件保持只读
请求记录包含方法、URL和字节数
```

### AC-07 下载文件

脚本通过 `fetch` 下载固定二进制内容，并通过 `fs.writeFile()` 写入 `output_files.mount_path` 指定的虚拟路径。

验收结果：

```text
输出字节与服务端夹具完全一致
Content-Length存在和不存在时都能处理
写入先改变虚拟文件系统且不立即修改工作区
成功后按mount_path到path的映射暂存到FileSession
输出大小计入单文件和累计限制
未声明输出路径写入失败
```

### AC-08 编辑图片

AI 声明一张固定 PNG 或 JPEG 输入图片和一个输出图片。纯 JavaScript 或 WASM 图片处理依赖已经安装在工作区 `node_modules` 并由 `package.json` 关联。

脚本执行裁剪、缩放或格式转换，例如将 `100x80` 图片裁剪为 `40x30`。

验收结果：

```text
脚本通过虚拟fs读取图片字节
图片处理包及WASM资源从同一虚拟文件系统读取
依赖不包含原生.node扩展
输出图片可以被现有图片读取逻辑打开
输出宽高和格式符合预期
输入图片内容未改变
输出在脚本成功后才暂存
```

### AC-09 普通网络请求

脚本向测试 JSON API 发起 GET 和 POST 请求，读取状态码、响应头及 JSON 响应。

验收结果：

```text
GET和POST成功
fetch通过现有network-adapter执行
请求头和请求体正确
Response.status、headers和json可用
请求超时能够中止
```

### AC-10 跨域网络请求

页面 origin 与测试 API origin 不同，API 响应不提供允许页面直接访问的 CORS 头。

验收结果：

```text
请求自动通过后端代理完成
代理地址改写和直连回退由现有network-adapter处理
脚本得到标准Response
目标查询参数和请求体保持不变
后端代理启用时遵循后端自身的目标地址策略
代理失败时不静默降级为不受控直连
```

### AC-11 普通 WASM

AI 声明一个固定 `.wasm` 输入文件，不提供文件类型，并将其挂载到不同的虚拟路径。脚本使用 `fs.readFile()` 和 `WebAssembly.instantiate()` 加载并调用导出函数。

示例断言：

```text
add(20, 22)返回42
```

验收结果：

```text
不需要自定义WASM解释器
fs返回的二进制可以直接实例化
导出函数结果正确
自定义mount_path生效
WASM文件保持只读
```

### AC-12 WASM Python 执行器

使用固定版本、可在 classic Worker 中加载的 Python-on-WASM 发行物或兼容测试夹具。发行物必须包含 JS 胶水代码、WASM 和所需数据资源，并固定版本和 integrity。

脚本加载 Python 运行时并执行：

```python
sum(range(101))
```

验收结果：

```text
Python运行时及其WASM资源通过受限网络或包资源加载
依赖资源计入请求、下载和缓存限制
Python执行结果为5050
运行超时时可以终止Worker
运行时不能读取未挂载的工作区文件
```

该场景允许配置更高但仍有上限的 `timeout_ms` 和内存读取限制，CI 使用本地固定资源服务器，避免依赖公开 CDN 稳定性。

### AC-13 加密模块

脚本使用虚拟 `node:crypto` 或纯 JavaScript/WASM 加密模块计算固定文本的 SHA-256 和 HMAC。

验收结果：

```text
结果与Node.js本地执行一致
randomBytes返回正确长度
timingSafeEqual行为正确
不需要原生.node扩展
```

### AC-14 文件读取隔离

AI 只声明工作区 `fixtures/allowed.txt`，并将其挂载为：

```text
/workspace/data/allowed.txt
```

脚本尝试读取：

```text
data/allowed.txt
fixtures/allowed.txt
secret.txt
../secret.txt
/etc/passwd
```

验收结果：

```text
data/allowed.txt读取成功
其他读取全部失败
未挂载路径返回稳定的VFS或Node兼容文件错误
脚本无法获取工作区文件句柄
```

### AC-15 输出事务性

脚本先在虚拟文件系统中写入两个声明输出，再抛出异常。

验收结果：

```text
工具返回失败
整个虚拟文件系统快照及两个脏输出都被丢弃
磁盘和编辑器模型均无部分修改
```

脚本成功时，只提取与回写映射匹配的脏文件，并在全部通过校验后一起暂存。

### AC-16 网络和下载限制

测试服务返回超过单次限制和累计限制的数据流。

验收结果：

```text
超过限制时中止读取
返回FILE_TOO_LARGE
错误包含phase、size和max_size
部分下载不得成为输出文件
```

### AC-17 超时和无限任务

脚本创建无限循环、长期定时器或永不完成的请求。

验收结果：

```text
达到timeout_ms后Worker被终止
网络请求被取消或忽略结果
虚拟文件系统实例和全部脏数据被丢弃
返回SCRIPT_TIMEOUT
```

### AC-18 不支持的 Node 能力

脚本或依赖尝试：

```js
require('node:child_process');
```

验收结果：

```text
不执行任何系统命令
返回UNSUPPORTED_NODE_BUILTIN
错误包含specifier和dependency_chain
```

依赖包含 `.node` 文件时返回 `UNSUPPORTED_NATIVE_MODULE`。

### AC-19 凭据注入

AI 声明一个存在凭据和一个缺失凭据。脚本读取 `process.env` 并发送到测试服务。

验收结果：

```text
仅声明的键可见
存在凭据值正确
缺失凭据为空字符串
工具结果返回missing_credentials但不返回凭据值
```

### AC-20 本地 Node.js 一致性

选择至少三个脚本：

```text
普通计算
文件读取写入
加密计算
```

本地通过：

```bash
npm install
node script.js ...args
```

编辑器通过 `run_javascript` 执行同一源码和等价参数。

验收结果：

```text
业务结果一致
输出文件内容一致
标准输出的关键内容一致
允许环境相关的路径、耗时和错误堆栈存在差异
```

### AC-21 入口 completion value

分别执行以下入口形式。

常见 Node CLI 形式：

```js
async function main() {
  await Promise.resolve();
  return 42;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

显式导出 Promise：

```js
async function main() {
  await Promise.resolve();
  return 43;
}

module.exports = main();
```

同步导出：

```js
module.exports = 44;
```

验收结果：

```text
常见Node CLI形式等待最后一条表达式返回的Promise并得到42
显式导出Promise得到43
同步导出得到44
依赖模块的最后一条Promise表达式不会改变同步require语义
入口Promise rejection返回SCRIPT_ERROR
入口catch后设置非零process.exitCode时执行失败
```

再执行：

```js
async function main() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  module.exports = 45;
}

main();
console.log('started');
```

该脚本不满足根 Promise 位于最后一条表达式的约定，运行时不保证等待 `main()`，工具描述必须明确这一边界。

### AC-22 手动 `node_modules` 查找目录

工作区将测试包安装在 `vendor/node_modules`，该目录不位于入口的标准 Node.js 向上查找链路中。AI 通过以下参数补充：

```json
{
  "node_modules_paths": [
    "vendor/node_modules"
  ]
}
```

验收结果：

```text
require能够加载指定目录中的测试包
测试包及其传递依赖映射为只读虚拟文件
未被依赖闭包引用的同目录包不进入虚拟文件系统快照
手动目录不会替代优先级更高的标准Node.js查找结果
逃逸工作区或不是node_modules目录的参数返回NODE_MODULES_PATH_INVALID
```

### AC-23 自定义挂载与原地回写

同一个工作区文本或二进制文件以相同 `mount_path` 同时声明在 `input_files` 和 `output_files` 中。脚本先读取原内容，再通过虚拟 `fs` 覆盖该文件。

验收结果：

```text
环境准备器将两条声明合并为一个可读写虚拟文件
读取内容来自执行开始时的effective快照
不需要type或view参数
执行过程中工作区和编辑器模型保持不变
成功后新内容按映射回写原工作区路径
脚本失败、超时或校验失败时原文件保持不变
不同来源映射到同一mount_path时返回MOUNT_PATH_CONFLICT
```

### AC-24 MemoryProvider 与文件操作能力

使用文件系统工厂创建 `type=memory` 的文件系统，并初始化只读脚本、只读输入、可写输出文件和可写输出目录。

验收结果：

```text
MemoryProvider继承FileSystemProvider并通过工厂和公共导出可用
stat、list、openRead、openWrite、write、createDirectory和remove共享同一内存目录树
openWrite在commit前不修改文件且abort后不残留文件或父目录
copyFile、递归copy、rename、unlink和递归目录删除行为正确
内存move一次性提交且atomicMove=true
只读文件拒绝覆盖、删除和移动，已声明写入授权在删除后仍可用于重新创建
Browser Handle Provider实现文件及目录copy/move并标记atomicMove=false
GithubProvider实现非原子文件copy/move并拒绝目录copy/move
源和目标版本前置条件冲突时不执行对应变更
```

## 21. 测试层级

| 层级 | 内容 |
| --- | --- |
| 单元测试 | FileSystemProvider 契约、MemoryProvider、copy/move、动态入口和 cwd、挂载冲突、路径映射、权限与版本前置条件、CommonJS 缓存、包入口、semver、错误序列化、Node 模块适配、network-adapter 复用 |
| Worker 单元测试 | 同一 MemoryProvider 上的 require 与 fs、完整脚本、入口 completion value、导出 Promise、超时、日志、WASM、process、Buffer |
| 集成测试 | package.json、工作区及手动 node_modules、嵌套传递依赖、显式 registry 夹具、URL 依赖、事务回写、代理请求 |
| 浏览器端到端测试 | AI 工具调用、上传、下载、图片编辑、跨域请求、Python-on-WASM |
| 本地一致性测试 | 同一脚本在 Node.js 与 Worker 中的结果对比 |

所有验收场景必须可重复执行。依赖公网的手工测试不能替代固定资源的自动化测试。

## 22. 完成定义

满足以下条件后视为需求完成：

1. 公开 `run_javascript` 同时支持完整 CommonJS `code` 和 `script_path`。
2. `MemoryProvider extends FileSystemProvider` 可以由规范化内存条目初始化，并作为 CommonJS 解析和所有虚拟 `fs` 操作的唯一文件来源。
3. `code` 和 `script_path` 的 `__filename`、`__dirname` 与 `process.cwd()` 均来自准备后的虚拟环境，不依赖固定虚拟路径。
4. `script_path` 自动读取关联 `package.json`、发现工作区 `node_modules` 并将所需依赖闭包映射到虚拟文件系统。
5. `code` 能通过工具参数使用手动 `node_modules` 目录、npm 或 URL 依赖。
6. `input_files` 不再需要 `type` 或 `view`，支持可选 `mount_path`；声明输出支持从虚拟路径事务性回写工作区。
7. Worker 网络接口和依赖资源下载复用现有 `network-adapter`，CommonJS 运行时不维护重复网络实现。
8. 文件、网络、CommonJS、虚拟 Node 模块和 WASM 行为符合本文档。
9. 旧函数体执行仅保留为内部 `filter_script` 实现。
10. AC-01 至 AC-24 全部通过。
11. 单元测试、集成测试和前端构建通过。
12. 工具描述明确说明支持范围、隔离边界和不支持能力。
