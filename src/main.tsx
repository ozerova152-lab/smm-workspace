import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { FirstLaunch } from './first-launch'
import '@mantine/core/styles.css'
import './styles.css'

const theme = createTheme({ primaryColor: 'blue', primaryShade: 8, defaultRadius: 'md', fontFamily: 'system-ui, sans-serif' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider forceColorScheme="dark" theme={theme}>
      <FirstLaunch />
    </MantineProvider>
  </StrictMode>,
)
