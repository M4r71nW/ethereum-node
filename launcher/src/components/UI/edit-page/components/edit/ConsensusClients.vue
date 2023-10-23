<template>
  <div class="col-start-2 col-end-3 gap-y-5 pt-4 pb-2 grid grid-flow-row auto-rows-max relative">
    <div
      v-for="item in getConsensus"
      :key="item.config.serviceID"
      ref="consensusRefs"
      class="h-[110px] w-[110px] flex justify-center items-center py-1 rounded-md shadow-md self-center justify-self-center cursor-pointer relative"
      :class="getDynamicClasses(item)"
      @click="displayMenu(item)"
      @mouseleave="hideMenu(item)"
      @mouseenter="mouseOver(item)"
    >
      <ClientLayout :client="item" />
      <TransitionGroup name="slide-fade">
        <GeneralMenu
          v-if="item.displayPluginMenu"
          :item="item"
          @switch-client="switchClient"
          @modify-service="modifyService"
          @delete-service="deleteService"
          @info-modal="infoModal"
        />
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup>
import { useNodeManage } from "@/store/nodeManage";
import ClientLayout from "./ClientLayout.vue";
import GeneralMenu from "./GeneralMenu.vue";

import { computed, ref, watchEffect, watch } from "vue";

//Props & Emits
const emit = defineEmits(["deleteService", "switchClient", "modifyService", "infoModal", "mouseOver", "mouseLeave"]);

//Refs

const consensusRefs = ref([]);
const manageStore = useNodeManage();
const isMouseOverClient = ref(false);
const isMousePassedClient = ref(false);

// computed & watchers properties
const getConsensus = computed(() => {
  return manageStore.newConfiguration
    .filter((e) => e.category == "consensus")
    .sort((a, b) => {
      let fa = a.name.toLowerCase(),
        fb = b.name.toLowerCase();

      if (fa < fb) {
        return -1;
      }
      if (fa > fb) {
        return 1;
      }
      return 0;
    });
});

const getConsensusRef = computed(() => {
  return consensusRefs.value.map((el, index) => {
    return {
      ref: el,
      refId: getConsensus.value[index]?.config.serviceID,
    };
  });
});
watch(isMouseOverClient, () => {
  if (isMouseOverClient.value) {
    isMousePassedClient.value = true;
  } else {
    isMousePassedClient.value = false;
  }
});

watchEffect(() => {
  manageStore.consensusRefList = getConsensusRef.value;
});

// methods

const getDynamicClasses = (item) => {
  if (item.hasOwnProperty("isRemoveProcessing") && item.isRemoveProcessing) {
    return "border bg-red-600 border-white hover:bg-red-600";
  } else if (item.hasOwnProperty("isNotConnectedToValidator") && item.isNotConnectedToValidator) {
    return "border border-blue-400 bg-blue-600 hover:bg-blue-600";
  } else if (
    item.hasOwnProperty("connectedToValidator") &&
    item.connectedToValidator &&
    manageStore.newConfiguration.filter((e) => e.category === "consensus").length > 1
  ) {
    return "border border-green-500 bg-green-500 hover:bg-green-500 pointer-events-none";
  } else {
    return "bg-[#212629] hover:bg-[#374045] border border-gray-700";
  }
};

const displayMenu = (item) => {
  manageStore.newConfiguration.forEach((service) => {
    service.displayPluginMenu = false;
    service.isConnectedToMevboost = false;
  });
  if (!item.isNotConnectedToMevboost && !item.isNotConnectedToValidator && !item.isRemoveProcessing) {
    item.displayPluginMenu = true;
  }
};

const hideMenu = (item) => {
  item.displayPluginMenu = false;
  emit("mouseLeave", item);
};

const mouseOver = (item) => {
  if (!item.displayPluginMenu) {
    emit("mouseOver", item);
  }
};

const deleteService = (item) => {
  emit("deleteService", item);
};

const switchClient = (item) => {
  emit("switchClient", item);
};

const modifyService = (item) => {
  emit("modifyService", item);
};
const infoModal = (item) => {
  emit("infoModal", item);
};
</script>
<style scoped>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.1s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(20px);
  opacity: 0;
}
</style>