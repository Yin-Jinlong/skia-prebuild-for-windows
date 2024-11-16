import {Command} from 'commander'
import console from 'console'
import fs from 'fs'
import path from 'path'

const PYVENV_CONFIG_FILE_NAME = 'pyvenv.cfg'

let VENV_ROOT: string

export function venvEnv(): any {
    return {
        ...process.env,
        PATH: `${findVenvRoot()}\\Scripts;${process.env.PATH}`
    }
}

function findVenvs(): string[] {
    let venvs: string[] = []
    fs.readdirSync('.', {withFileTypes: true}).forEach(dir => {
        if (dir.isDirectory()) {
            let venvPath = path.resolve(dir.name, PYVENV_CONFIG_FILE_NAME)
            if (fs.existsSync(venvPath))
                venvs.push(dir.name)
        }
    })
    return venvs
}

export function findVenvRoot(): string {
    if (VENV_ROOT)
        return VENV_ROOT
    let venvs = findVenvs()
    if (venvs.length == 0)
        throw new Error('No virtual environment found')
    if (venvs.length > 1)
        throw new Error('Multiple virtual environments found: ' + venvs.join(', '))
    VENV_ROOT = path.resolve(venvs[0])
    return VENV_ROOT
}

export function venv(root: Command) {
    root.command('venv')
        .description('查看虚拟环境')
        .action((args) => {
            let venv = findVenvRoot()
            let py3 = path.resolve(venv, 'Scripts', 'python3.exe')
            if (!fs.existsSync(py3)) {
                console.error('No python3 found in venv')
            }
            console.log(`VENV: ${venv}`)
        })
}
