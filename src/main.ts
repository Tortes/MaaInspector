import { createApp } from "vue";
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './assets/styles/tailwind.css'
import App from "./App.vue";
import { installFrontendLogger } from '@/utils/logger'

installFrontendLogger()

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(ElementPlus);
app.mount("#app");
