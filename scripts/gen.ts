import {spawnSync} from 'child_process'
import {Command} from 'commander'
import console from 'console'
import * as process from 'node:process'
import {getLLVMInfo} from './llvm'
import {venvEnv} from './venv'
import {getVSInfo} from './vs'
import {getWinKits} from './winkits'

declare interface GenOptions {
    arch: string
    debug?: boolean
    msvcVersion?: string
    runtime: string
    sdkVersion?: string
    shared?: boolean
    useLlvm?: boolean
    useVulkan?: boolean
}

declare interface GnArgs {
    [k: string]: any
}

const ARGS: GnArgs = {
    skia_use_system_expat: false,
    skia_use_system_harfbuzz: false,
    skia_use_system_icu: false,
    skia_use_system_libjpeg_turbo: false,
    skia_use_system_libpng: false,
    skia_use_system_libwebp: false,
    skia_use_system_zlib: false,
    extra_cflags: [],
    extra_ldflags: [],
}

function gn(dir: string, args: GnArgs) {
    let argsStr = ''
    let out = `out/${dir}`

    process.stdout.write('Args ')
    console.dir(args)
    console.log('Out', out)

    Object.entries(args).forEach(([key, value]) => {
        if (value === undefined)
            return
        if (typeof value === 'string') {
            argsStr += `${key}="${value}" `
        } else if (Array.isArray(value)) {
            argsStr += `${key}=[${value.join(',')}] `
        } else {
            argsStr += `${key}=${value} `
        }
    })
    spawnSync('bin/gn.exe', [
        'gen',
        `${out}`,
        `--args= ${argsStr}`
    ], {
        stdio: 'inherit',
        env: venvEnv()
    })
}

function getWinSdk(v?: string): WinKitInfo {
    let list = getWinKits().sort((a, b) => {
        return a.version.localeCompare(b.version)
    }).reverse()
    let r = v ? list.find(i => i.version === v) : list[0]
    if (!r)
        throw new Error(`未找到Windows SDK: ${v}`)
    return r
}

export function genOut(compiler: AppInfo, sdk: WinKitInfo, options: GenOptions) {
    let shared = options.shared
    let use_llvm = compiler.id === 'llvm'
    let debug = options.debug == true
    let type = options.shared ? 'shared' : 'static'

    let rt=`${options.runtime}${debug ? 'd' : ''}`

    let dir = `${compiler.id}-${type}-${debug ? 'debug' : 'release'}-${rt}`
    let args: GnArgs = {
        is_component_build: shared === true,
        is_debug: debug,
        is_official_build: !debug,
        ...ARGS,
        target_cpu: options.arch,
        cc: use_llvm ? 'clang' : 'cl',
        cxx: use_llvm ? 'clang++' : 'cl',
        extra_cflags: [`"/${rt}"`],
        win_sdk: sdk.root,
        win_sdk_version: sdk.version,
    }

    if (options.useVulkan)
        args['skia_use_vulkan'] = true

    gn(dir, use_llvm ? {
        ...args,
        clang_win: compiler.root,
        clang_win_version: compiler.version
    } : {
        ...args,
        win_vc: compiler.root + '\\VC',
        win_toolchain_version: compiler.version,
    })
}

export function gen(root: Command) {
    root.command('gen')
        .description('生成构建文件')
        .option('-d, --debug', 'debug版本')
        .option('--msvc-version <version>', 'MSVC version，默认最新')
        .option('-r, --runtime <type>', 'MT MD', 'MT')
        .option('--sdk-version <version>', 'WinSDK version，默认最新')
        .option('--use-llvm')
        .option('--use-vulkan')
        .option('--shared')
        .option('-a, --arch <cpu>', 'cpu类型', 'x64')
        .action((args: GenOptions) => {
            let ci = args.useLlvm ? getLLVMInfo() : getVSInfo(args.msvcVersion)
            if (!ci)
                throw new Error('未找到编译器')

            process.stdout.write('Compiler ')
            console.dir(ci)
            genOut(ci, getWinSdk(args.sdkVersion), args)
        })
}
