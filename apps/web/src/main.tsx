import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from './app/providers'
import { router } from './app/router'
// Inter and JetBrains Mono, self-hosted as variable fonts (SIL OFL 1.1, via fontsource). Each
// stylesheet declares one @font-face per script with a unicode-range, so a page only fetches the
// Latin file. The Chinese face is declared in styles.css, where it carries its own unicode-range.
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import './styles/styles.css'

createRoot(document.getElementById('root')!).render(
  <Providers>
    <RouterProvider router={router} />
  </Providers>,
)
