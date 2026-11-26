import { localProjectStorage } from './lib/project-storage'

export async function inspectStorage(): Promise<void> {
  await localProjectStorage.list()
}
