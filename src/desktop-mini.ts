import { disableHotkeys } from './utils/tools'
import '@/styles/global.css'
import DesktopMiniWindow from '@/views/DesktopMini.vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'

disableHotkeys()

const pinia = createPinia().use(piniaPluginPersistedstate)
createApp(DesktopMiniWindow).use(pinia).mount('#app')
