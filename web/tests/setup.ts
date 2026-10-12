import { configure } from '@testing-library/react'

/*
 * Folga para máquinas ocupadas (várias suítes, Vite, API e navegador ao mesmo tempo): as esperas do Testing Library
 * (`findBy*`, `waitFor`) passam de 1 s para 4 s. Os testes que passam não ficam mais lentos; só uma falha de verdade
 * demora mais a aparecer. O tempo de cada teste (`testTimeout`) está em `vitest.config.ts`.
 */
configure({ asyncUtilTimeout: 4000 })
