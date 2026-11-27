import React from 'react'

/*
 * react-native-gesture-handler depende do runtime nativo. Nos testes, `Gesture.Pan()` e `Gesture.Pinch()` só guardam os
 * callbacks (`handlers.change`, `handlers.end`) e se estão habilitados; o teste pega o gesto no `GestureDetector`
 * (`props.gesture.gestures`) e chama os callbacks como o aparelho chamaria, dentro de `act`.
 */
type Handler = (event: Record<string, number>) => void

export class GestureMock {
  handlers: Record<string, Handler> = {}
  isEnabled = true
  constructor(public kind: 'pan' | 'pinch') {}
  enabled(value: boolean) { this.isEnabled = value; return this }
  onStart(handler: Handler) { this.handlers.start = handler; return this }
  onChange(handler: Handler) { this.handlers.change = handler; return this }
  onUpdate(handler: Handler) { this.handlers.update = handler; return this }
  onEnd(handler: Handler) { this.handlers.end = handler; return this }
}

export const Gesture = {
  Pan: () => new GestureMock('pan'),
  Pinch: () => new GestureMock('pinch'),
  Simultaneous: (...gestures: GestureMock[]) => ({ kind: 'simultaneous', gestures }),
}

export const GestureDetector = ({ gesture, children }: { gesture: unknown; children?: React.ReactNode }) => React.createElement('GestureDetector', { gesture }, children)
export const GestureHandlerRootView = ({ children, ...props }: Record<string, unknown>) => React.createElement('GestureHandlerRootView', props, children as React.ReactNode)
