import { RBAC, Roles } from './rbac'

type TestRole = 'reader' | 'editor' | 'publisher'
interface TestParams {
  userId: string
  userHasSubscription?: boolean
  departmentId?: string
  articleId?: string
  articleIsPremium?: boolean
}

const roles: Roles<TestParams, TestRole> = {
  reader: {
    can: ['article:read', 'article:list'],
  },
  editor: {
    can: [],
    inherits: ['reader'],
  },
  publisher: {
    can: [],
    inherits: ['editor'],
  },
}

const rolesPromise = new Promise<typeof roles>((resolve) => {
  setTimeout(() => {
    resolve(roles)
  }, 1000)
})

const rolesFactory = async () => {
  const rolesPromise = new Promise<typeof roles>((resolve) => {
    setTimeout(() => {
      resolve(roles)
    }, 1000)
  })

  return rolesPromise
}

describe('RBAC should initialize', () => {
  test('with construtor.', () => {
    expect(new RBAC(roles)).toBeInstanceOf(RBAC)
  })

  test('with async create function.', async () => {
    expect(await RBAC.create(roles)).toBeInstanceOf(RBAC)
  })

  test('with async create function and roles promise.', async () => {
    expect(await RBAC.create(rolesPromise)).toBeInstanceOf(RBAC)
  })

  test('with async create function and roles factory function.', async () => {
    expect(await RBAC.create(rolesFactory)).toBeInstanceOf(RBAC)
  })
})
