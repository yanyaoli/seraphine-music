import { disableHotkeys } from './utils/tools'
import router from '@/router/index'
import '@/styles/global.css'
import App from '@/views/App.vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

disableHotkeys()

const pinia = createPinia().use(piniaPluginPersistedstate)

createApp(App).use(pinia).use(router).mount('#app')
