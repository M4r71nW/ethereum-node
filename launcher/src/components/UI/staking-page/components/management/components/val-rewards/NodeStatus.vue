<template>
  <div class="w-full h-full max-h-5 col-start-1 col-span-full row-span-1 grid grid-cols-6 items-center px-[1px]">
    <div class="h-full col-start-1 col-end-4 self-center flex justify-start items-center px-2 rounded-l-full">
      <span class="text-[8px] text-amber-300 font-normal font-sans text-left">NODE STATUS</span>
    </div>
    <div class="w-full col-start-4 col-span-full rounded-full self-center flex justify-center items-center bg-black h-full max-h-4 px-1">
      <span class="text-[8px] font-semibold" :class="getStatusColor">{{ getNodeStatus }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useStakingStore } from "../../../../../../../store/theStaking";

const stakingStore = useStakingStore();

const getNodeStatus = computed(() => {
  if (stakingStore.selectedServiceToFilter?.service === "SSVNetworkService") {
    return stakingStore.ssvStats?.status ? stakingStore.ssvStats?.status.toUpperCase() : "N/A";
  } else if (stakingStore.selectedServiceToFilter?.service === "CharonService") {
    return stakingStore.obolStats?.nodeStatus ? stakingStore.obolStats?.nodeStatus : "N/A";
  }
  return "N/A";
});

const getStatusColor = computed(() => {
  let clr;
  if (getNodeStatus.value === "ACTIVE") {
    clr = "text-green-500";
  } else {
    clr = "text-red-500";
  }
  return clr;
});
</script>
