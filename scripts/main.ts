import {Command} from 'commander'
import * as process from 'node:process'
import {build} from './build'
import {gen} from './gen'
import {update} from './update'
import {venv} from './venv'
import {getWinKits} from './winkits'

const cmd = new Command()

function init() {
    cmd.version('1.0.0-dev')
    build(cmd)
    gen(cmd)
    update(cmd)
    venv(cmd)
    getWinKits()
}

function run() {
    cmd.parse()
}

process.chdir('..')
init()
run()