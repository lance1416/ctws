import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from './app/providers'
import { router } from './app/router'
// IBM Plex Sans, self-hosted, Latin only, in the three weights the type scale uses. The Chinese
// face is declared in styles.css, where it can carry a unicode-range.
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './styles/styles.css'

createRoot(document.getElementById('root')!).render(
  <Providers>
    <RouterProvider router={router} />
  </Providers>,
)
