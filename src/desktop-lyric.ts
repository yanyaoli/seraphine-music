import { disableHotkeys } from './utils/tools'
import '@/styles/global.css'
import DesktopLyricWindow from '@/views/DesktopLyric.vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'

disableHotkeys()

const pinia = createPinia().use(piniaPluginPersistedstate)
createApp(DesktopLyricWindow).use(pinia).mount('#app')
