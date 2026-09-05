export const fictionalSeed = {
  users: [
    { key: 'user-a', displayName: 'User A' },
    { key: 'user-b', displayName: 'User B' },
  ],
  members: [
    { key: 'member-alpha', displayName: '成员甲' },
    { key: 'member-beta', displayName: '成员乙' },
  ],
} as const

// This definition deliberately performs no database writes. A future explicit
// seed command must require a confirmed non-production target.
