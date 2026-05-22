<template>
  <div class="flex h-screen w-screen bg-gray-100 overflow-hidden">
    <FlowWorkspace />
  </div>
</template>

<script setup lang="ts">
import FlowWorkspace from "./components/FlowWorkspace.vue";
</script>
<style>
#app {
  width: 100%;
  height: 100%;
}
</style>
