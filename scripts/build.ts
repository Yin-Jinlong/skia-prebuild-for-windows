import {spawnSync} from 'child_process'
import {Command} from 'commander'
import path from 'path'
import {install} from './build.install'
import {venvEnv} from './venv'

declare interface BuildOptions {
    component?: string[]
    dir: string
    install?: boolean
    out: string
}

function buildOut(dir: string) {
    let r = spawnSync('ninja', [
        '-C',
        path.resolve('out', dir)
    ], {
        stdio: 'inherit',
        env: venvEnv()
    })
    if (r.status) {
        console.error('build failed')
        process.exit(r.status)
    }
}

function getHASH(): string {
    let r = spawnSync('git', ['rev-parse', 'HEAD'], {
        stdio: 'pipe',
    })
    if (r.status) {
        throw new Error(r.stderr.toString())
    }
    let s = r.stdout.toString().trim()
    return s.substring(0, 6)
}

export function build(root: Command) {
    root.command('build')
        .description('构建')
        .option('-c, --component <name...>', 'component')
        .option('-i, --install', 'install out')
        .option('-d, --dir <path>', 'install dir', 'out/skia')
        .requiredOption('-o, --out <dir>', 'out/<dir>')
        .action((args: BuildOptions) => {
            buildOut(args.out)
            if (args.install)
                install(args.out, path.resolve(args.dir, `skia-${getHASH()}-${args.out}`))
        })
}
