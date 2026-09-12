import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { loadTypescript } from './helpers/load-typescript.mjs'

test('failed desk exposes recovery controls while healthy desk preserves its content', () => {
  const { ConsolePaneBoundary } = loadTypescript('src/components/ConsolePaneBoundary.tsx')
  const boundary = new ConsolePaneBoundary({ children: createElement('p', null, 'Existing workspace') })
  assert.match(renderToStaticMarkup(boundary.render()), /Existing workspace/)
  boundary.state = ConsolePaneBoundary.getDerivedStateFromError(new Error('chunk failed'))
  const failed = renderToStaticMarkup(boundary.render())
  assert.match(failed, /role="alert"/)
  assert.match(failed, /Try again/)
  assert.match(failed, /Reload Compass/)
  assert.doesNotMatch(failed, /Existing workspace/)
  boundary.setState = update => { boundary.state = { ...boundary.state, ...update } }
  const buttons = boundary.render().props.children[2].props.children
  buttons[0].props.onClick()
  assert.match(renderToStaticMarkup(boundary.render()), /Existing workspace/)
})
