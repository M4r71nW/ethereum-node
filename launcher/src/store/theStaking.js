import { defineStore } from "pinia";

export const useStakingStore = defineStore("theStaking", {
  state: () => {
    return {
      currentEpoch: 0,
      currentSlot: 0,
      secondsPerSlot: null,
      slotsPerEpoch: null,
      // ***** Staking List
      isStakingDisabled: true,
      selectedServiceToFilter: null,
      filteredKeys: null,
      searchedKeys: [],
      activePanel: "insert",
      searchContent: "",
      isOverDropZone: false,
      inputWrongKey: false,
      isPreviewListActive: false,
      importEnteredPassword: null,
      importKeyMessage: "",
      checkActiveValidatorsResponse: [],
      previewKeys: [],
      doppelgangerKeys: [],
      isDoppelgangerProtectionActive: false,
      keyNumbers: 0,
      //***** End Staking List

      // ***** Staking Modals *****
      activeModal: null,
      // ***** End Staking Modals *****

      // ***** Staking Groups *****
      mode: "create",
      groupName: null,
      currentGroup: null,
      isGroupListActive: false,
      isGroupingAllowed: false,
      validatorKeyGroups: [],
      filteredGroups: [],
      selectedGroup: null,
      selectedValidatorKeys: [],
      // ***** End Staking Groups *****

      // ***** Staking Remote Keys *****
      isRemoteListActive: false,
      previewRemoteKeys: [], // Remote Keys List to display
      remoteKeys: [], // Remote Keys List
      remoteUrl: "",
      remoteResponse: null,
      remoteResponseMessage: null,

      // ***** End Staking Remote Keys *****

      // ***** Validator Keys *****
      isImportValidatorButtonClicked: false,
      displayDoppelgangerPreview: false,
      passwordFiles: [],
      isPubkeyVisible: false,
      removeResponse: [],
      removeKeys: [],
      pickedSlashing: "no",
      slashingDB: "", // Slashing DB
      selectedKeyToRemove: null,
      selectKeyToRename: null,
      selectKeyForFee: null,
      isRenameKeyActive: false,
      validatorDisplayName: "",
      enteredFeeRecipientAddress: "",
      feeRecepientAddress: "",
      displayAllKeysActive: true,
      // ***** End Validator Keys *****
      selectedSingleKeyToWithdraw: null,
      withdrawAndExitResponse: null,
      withdrawIsChecked: false,
      exitMultiValidatorKeys: false,
      doppelgangerStatus: true,
      selectedIcon: "",
      importValidatorKeyActive: true,
      passwordInputActive: false,
      stats: {},
      selectedValidatorService: {},
      totalBalance: 0,
      keys: [],
      keyFiles: [],
      keyImages: [],
      forceRefresh: false,
      storedValidatorKeys: [],
      insertKeyBoxActive: true,
      enterPasswordBox: false,
      importRemoteKeysActive: false,
      display: true,
      isDragOver: false,
      dragStep: false,
      clickService: false,
      modalGuide: false,
      passPointer: false,
      keyCounter: 0,
      obolStats: {},
      ssvStats: {},
      isSkeletonActive: true,
    };
  },
  actions: {
    setActivePanel(panelName) {
      this.activePanel = panelName;
    },
    setActiveModal(modalName) {
      this.activeModal = modalName;
    },
    setMode(mode) {
      this.mode = mode;
    },
    setValidatorName(newName) {
      this.validatorDisplayName = newName;
    },
  },
});
