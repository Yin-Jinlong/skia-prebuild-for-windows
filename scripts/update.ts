import {spawnSync} from 'child_process'
import {Command} from 'commander'
import {venvEnv} from './venv'

export function update(root: Command) {
    root.command('update')
        .description('更新依赖')
        .action(args => {
            spawnSync('python3', [
                'tools/git-sync-deps'
            ], {
                stdio: 'inherit',
                shell: true,
                env: venvEnv()
            })
        })
}
