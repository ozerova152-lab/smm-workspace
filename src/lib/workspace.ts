import { localProjectStorage } from './project-storage'
import { createWorkspaceStub } from './stubs/workspace'

export function createWorkspace(params: URLSearchParams) {
  const projectStorage = params.get('mode') === 'demo' ? undefined : localProjectStorage
  return createWorkspaceStub(params, projectStorage)
}
