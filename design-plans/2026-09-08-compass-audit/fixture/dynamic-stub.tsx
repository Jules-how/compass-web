import React, { lazy, Suspense } from 'react'
export default function dynamic(loader: () => Promise<{default: React.ComponentType<any>}>, options?: {loading?: React.ComponentType}) {
  const Component = lazy(loader)
  const Loading = options?.loading ?? (() => null)
  return function Dynamic(props: any) { return <Suspense fallback={<Loading />}><Component {...props} /></Suspense> }
}
