"use strict";

import { app, protocol, BrowserWindow, shell, dialog, ipcMain, Menu } from "electron";
import { createProtocol } from "vue-cli-plugin-electron-builder/lib";
import { StorageService } from "./storageservice.js";
import { NodeConnection } from "./backend/NodeConnection.js";
import { OneClickInstall } from "./backend/OneClickInstall.js";
import { ServiceManager } from "./backend/ServiceManager.js";
import { ValidatorAccountManager } from "./backend/ValidatorAccountManager.js";
import { TaskManager } from "./backend/TaskManager.js";
import { Monitoring } from "./backend/Monitoring.js";
import { StereumUpdater } from "./StereumUpdater.js";
import { ConfigManager } from "./backend/ConfigManager.js";
import { AuthenticationService } from "./backend/AuthenticationService.js";
import { TekuGasLimitConfig } from "./backend/TekuGasLimitConfig.js";
import { SSHService } from "./backend/SSHService.js";
import { ProtocolHandler } from "./backend/CustomUrlProtocol.js";
import path from "path";
import { readFileSync, existsSync, mkdirSync, renameSync, readdir, rmSync } from "fs";
import url from "url";
import checkSigningKeys from "./backend/web3/CSM.js";
const isDevelopment = process.env.NODE_ENV !== "production";
const nodeConnection = new NodeConnection();
const storageService = new StorageService();
const taskManager = new TaskManager(nodeConnection);
const monitoring = new Monitoring(nodeConnection);
const oneClickInstall = new OneClickInstall();
const serviceManager = new ServiceManager(nodeConnection);
const validatorAccountManager = new ValidatorAccountManager(nodeConnection, serviceManager);
const configManager = new ConfigManager(nodeConnection);
configManager.setServiceManager(serviceManager);
const authenticationService = new AuthenticationService(nodeConnection);
const tekuGasLimitConfig = new TekuGasLimitConfig(nodeConnection);
const sshService = new SSHService();
const { globalShortcut } = require("electron");
const log = require("electron-log");
const stereumUpdater = new StereumUpdater(log, createWindow, isDevelopment);
const protocolHandler = new ProtocolHandler(storageService);
stereumUpdater.initUpdater();
log.transports.console.level = process.env.LOG_LEVEL || "info";
log.transports.file.level = "debug";
log.transports.file.archiveLogFn = async (file) => {
  file = file.toString();
  const info = path.parse(file);
  let backupPath = info.dir + "/backups/";
  if (!existsSync(backupPath)) {
    mkdirSync(backupPath);
  }

  renameSync(file, `${backupPath}main-${Date.now()}.log`);

  let backupLogs = [];
  let backupAmount = 3;

  const storedConfig = await storageService.readConfig();
  if (storedConfig.logBackups) {
    backupAmount = storedConfig.logBackups.value;
  }

  readdir(backupPath, (err, files) => {
    files.forEach((file) => {
      backupLogs.push(file);
    });
    if (backupLogs.length > backupAmount) {
      backupLogs.reverse();
      for (let i = backupAmount; i < backupLogs.length; i++) {
        rmSync(backupPath + backupLogs[i], { force: true }, (err) => {
          if (err) throw err;
        });
      }
    }
  });
};

let remoteHost = {};

ipcMain.handle("ready", () => {
  log.info("background process ready");
});

ipcMain.handle("connect", async (event, arg) => {
  remoteHost = arg;
  if (arg?.sshKeyAuth) {
    remoteHost.privateKey = readFileSync(arg.keyfileLocation, {
      encoding: "utf8",
    });
  }
  nodeConnection.nodeConnectionParams = remoteHost;
  await nodeConnection.establish(taskManager, event.sender);
  await monitoring.login();
  return 0;
});

ipcMain.handle("reconnect", async () => {
  if (nodeConnection.sshService.connectionPool.length > 0) await nodeConnection.sshService.disconnect(true);
  try {
    await nodeConnection.establish(taskManager);
  } catch (err) {
    log.error("Couldn't reconnect:\n", err);
  }
});

ipcMain.handle("checkConnection", async () => {
  await nodeConnection.sshService
    .checkSSHConnection(nodeConnection.nodeConnectionParams, 18000)
    .then((isConnected) => {
      nodeConnection.sshService.connected = isConnected;
    })
    .catch((error) => {
      console.error("Error checking SSH connection:", error);
      nodeConnection.sshService.connected = false;
    });
  return nodeConnection.sshService.connected;
});

ipcMain.handle("destroy", async () => {
  app.showExitPrompt = true;
  const serviceConfigs = await serviceManager.readServiceConfigurations();
  const returnValue = await nodeConnection.destroyNode(serviceConfigs);
  app.showExitPrompt = false;
  return returnValue;
});

ipcMain.handle("watchSSVDKG", async () => {
  return serviceManager.watchSSVDKG();
});

ipcMain.handle("tunnel", async (event, arg) => {
  return nodeConnection.openTunnels(arg);
});

ipcMain.handle("closeTunnels", async () => {
  return await nodeConnection.closeTunnels();
});

ipcMain.handle("logout", async () => {
  await monitoring.logout();
  return await nodeConnection.logout();
});

ipcMain.handle("idleTimerCheck", async (event, args) => {
  const current_window = event.sender;
  return await monitoring.idleTimerCheck(args.timerStop, current_window);
});

ipcMain.handle("setIdleTime", async (event, arg) => {
  return await monitoring.setIdleTime(arg);
});

// userData storage
ipcMain.handle("readConfig", async () => {
  return storageService.readConfig();
});
ipcMain.handle("writeConfig", async (event, arg) => {
  return storageService.writeConfig(arg);
});

ipcMain.handle("isCheckpointValid", async (event, cp_url) => {
  return await monitoring.isCheckpointValid(cp_url);
});

ipcMain.handle("checkOS", async () => {
  await nodeConnection.findStereumSettings();
  return nodeConnection.findOS();
});

ipcMain.handle("checkSudo", async () => {
  return await nodeConnection.checkSudo();
});

ipcMain.handle("getOneClickConstellation", async (event, arg) => {
  return await oneClickInstall.getSetupConstellation(arg.setup, arg.network);
});

ipcMain.handle("prepareOneClickInstallation", async (event, arg) => {
  app.showExitPrompt = true;
  return await oneClickInstall.prepareNode(arg, nodeConnection);
});

ipcMain.handle("writeOneClickConfiguration", async (event, args) => {
  log.info(args);
  await oneClickInstall.createServices(
    args.array.map((service) => {
      return service.service;
    }),
    args.checkpointURL,
    args.relayURL,
    args.selectedPreset
  );
  return await oneClickInstall.writeConfig();
});

ipcMain.handle("startOneClickServices", async () => {
  const returnValue = await oneClickInstall.startServices();
  app.showExitPrompt = false;
  return returnValue;
});

// open rpc tunnel
ipcMain.handle("openRpcTunnel", async (event, args) => {
  return await monitoring.openRpcTunnel(args);
});

// close rpc tunnel
ipcMain.handle("closeRpcTunnel", async () => {
  return await monitoring.closeRpcTunnel();
});

// open ws tunnel
ipcMain.handle("openWsTunnel", async (event, args) => {
  return await monitoring.openWsTunnel(args);
});

// close ws tunnel
ipcMain.handle("closeWsTunnel", async () => {
  return await monitoring.closeWsTunnel();
});

// open beacon tunnel
ipcMain.handle("openBeaconTunnel", async (event, args) => {
  return await monitoring.openBeaconTunnel(args);
});

// close beacon tunnel
ipcMain.handle("closeBeaconTunnel", async () => {
  return await monitoring.closeBeaconTunnel();
});

// get data for node stats (prometheus, and so on)
ipcMain.handle("getNodeStats", async () => {
  return await monitoring.getNodeStats();
});

// get data for control cpu comp
ipcMain.handle("getServerVitals", async () => {
  return await monitoring.getServerVitals();
});

// get data for storage comp
ipcMain.handle("getStorageStatus", async () => {
  return await monitoring.getStorageStatus();
});

// get data for balance comp
ipcMain.handle("getBalanceStatus", async () => {
  return await monitoring.getBalanceStatus();
});

ipcMain.handle("getConnectionStats", async () => {
  const name = await monitoring.getServerName();
  const address = monitoring.getIPAddress();
  return { ServerName: name, ipAddress: address };
});

ipcMain.handle("getAvailablePort", async (event, args) => {
  return await nodeConnection.checkAvailablePorts(args);
});

ipcMain.handle("checkStereumInstallation", async () => {
  return await monitoring.checkStereumInstallation(nodeConnection);
});

ipcMain.handle("getServices", async () => {
  return await serviceManager.readServiceConfigurations();
});

// get data for service logs
ipcMain.handle("getServiceLogs", async (event, args) => {
  return await monitoring.getServiceLogs(args);
});

ipcMain.handle("getAllServiceLogs", async (event, args) => {
  return await nodeConnection.getAllServiceLogs(args);
});

ipcMain.handle("getServiceConfig", async (event, args) => {
  return await nodeConnection.readServiceConfiguration(args);
});

ipcMain.handle("writeServiceConfig", async (event, args) => {
  return await nodeConnection.writeServiceConfiguration(args);
});

ipcMain.handle("getServiceYAML", async (event, args) => {
  return await nodeConnection.readServiceYAML(args);
});

ipcMain.handle("writeServiceYAML", async (event, args) => {
  return await nodeConnection.writeServiceYAML(args);
});

ipcMain.handle("importKey", async (event, args) => {
  app.showExitPrompt = true;
  const returnValue = await validatorAccountManager.importKey(args);
  app.showExitPrompt = false;
  return returnValue;
});

ipcMain.handle("deleteValidators", async (event, args) => {
  return await validatorAccountManager.deleteValidators(args.serviceID, args.keys, args.picked);
});

ipcMain.handle("listValidators", async (event, args) => {
  return await validatorAccountManager.listValidators(args);
});

ipcMain.handle("listServices", async () => {
  return await nodeConnection.listServices();
});

ipcMain.handle("manageServiceState", async (event, args) => {
  return await serviceManager.manageServiceState(args.id, args.state);
});

ipcMain.handle("runAllUpdates", async (event, args) => {
  app.showExitPrompt = true;
  const returnValue = await nodeConnection.nodeUpdates.runAllUpdates(args.commit);
  app.showExitPrompt = false;
  return returnValue;
});

ipcMain.handle("updateServices", async (event, args) => {
  app.showExitPrompt = true;
  let seconds = await nodeConnection.nodeUpdates.updateServices(args.services);
  app.showExitPrompt = false;
  return seconds;
});

ipcMain.handle("updateStereum", async (event, args) => {
  app.showExitPrompt = true;
  let seconds = await nodeConnection.nodeUpdates.updateStereum(args.commit);
  app.showExitPrompt = false;
  return seconds;
});

ipcMain.handle("restartServices", async (event, args) => {
  await nodeConnection.nodeUpdates.restartServices(args);
});

ipcMain.handle("restartService", async (event, args) => {
  await serviceManager.restartService(args);
});

ipcMain.handle("checkUpdates", async () => {
  return await nodeConnection.nodeUpdates.checkUpdates();
});

ipcMain.handle("getCurrentOsVersion", async () => {
  return await nodeConnection.nodeUpdates.getCurrentOsVersion();
});

ipcMain.handle("getCountOfUpdatableOSUpdate", async () => {
  return await nodeConnection.nodeUpdates.getCountOfUpdatableOSUpdate();
});

ipcMain.handle("updateOS", async () => {
  return await nodeConnection.nodeUpdates.updateOS();
});

ipcMain.handle("updatePackage", async (event, args) => {
  return await nodeConnection.nodeUpdates.updatePackage(args);
});

ipcMain.handle("getUpgradeablePackages", async () => {
  return await nodeConnection.nodeUpdates.getUpgradeablePackages();
});

ipcMain.handle("upgradeToNoble", async () => {
  return await nodeConnection.nodeUpdates.upgrade();
});

ipcMain.handle("getCurrentStereumVersion", async () => {
  return await nodeConnection.getCurrentStereumVersion();
});

ipcMain.handle("getCurrentLauncherVersion", async () => {
  return await nodeConnection.getCurrentLauncherVersion();
});

ipcMain.handle("getLargestVolumePath", async () => {
  return await nodeConnection.getLargestVolumePath();
});

ipcMain.handle("getTasks", async () => {
  return await taskManager.getTasks();
});

ipcMain.handle("updateTasks", async () => {
  return await taskManager.updateTasks();
});

ipcMain.handle("clearTasks", async () => {
  return await taskManager.clearTasks();
});

ipcMain.handle("insertSSVNetworkKeys", async (event, args) => {
  return await validatorAccountManager.insertSSVNetworkKeys(args.service, args.pk);
});

ipcMain.handle("refreshServiceInfos", async () => {
  return await monitoring.refreshServiceInfos();
});

ipcMain.handle("getFeeRecipient", async (event, args) => {
  return await validatorAccountManager.getFeeRecipient(args.serviceID, args.pubkey);
});

ipcMain.handle("setFeeRecipient", async (event, args) => {
  return await validatorAccountManager.setFeeRecipient(args.serviceID, args.pubkey, args.address);
});

ipcMain.handle("deleteFeeRecipient", async (event, args) => {
  return await validatorAccountManager.deleteFeeRecipient(args.serviceID, args.pubkey);
});

ipcMain.handle("setGraffitis", async (event, args) => {
  return await validatorAccountManager.setGraffitis(args.id, args.graffiti);
});

ipcMain.handle("chooseServiceAction", async (event, args) => {
  return await serviceManager.chooseServiceAction(args.action, args.service, args.data);
});

ipcMain.handle("handleServiceChanges", async (event, args) => {
  return await serviceManager.handleServiceChanges(args);
});

ipcMain.handle("getStereumSettings", async () => {
  await nodeConnection.findStereumSettings();
  return nodeConnection.settings;
});

ipcMain.handle("setStereumSettings", async (event, args) => {
  return await nodeConnection.setStereumSettings(args);
});

ipcMain.handle("writeKeys", async (event, args) => {
  return await validatorAccountManager.writeKeys(args);
});

ipcMain.handle("readKeys", async () => {
  return await validatorAccountManager.readKeys();
});

ipcMain.handle("prepareStereumNode", async (event, args) => {
  app.showExitPrompt = true;
  await oneClickInstall.prepareNode(args, nodeConnection);
  app.showExitPrompt = false;
  return 0;
});

ipcMain.handle("restartServer", async () => {
  return await nodeConnection.restartServer();
});

ipcMain.handle("forwardSSVCommand", async (event, args) => {
  return await nodeConnection.forwardSSVCommand(args);
});

ipcMain.handle("getSSVTotalConfig", async (event, args) => {
  return await nodeConnection.getSSVTotalConfig(args);
});

ipcMain.handle("readSSVNetworkConfig", async (event, args) => {
  return await nodeConnection.readSSVNetworkConfig(args);
});

ipcMain.handle("writeSSVNetworkConfig", async (event, args) => {
  return await nodeConnection.writeSSVNetworkConfig(args.serviceID, args.config);
});

ipcMain.handle("getSSVDKGTotalConfig", async (event, args) => {
  return await nodeConnection.getSSVDKGTotalConfig(args);
});

ipcMain.handle("readSSVDKGConfig", async (event, args) => {
  return await nodeConnection.readSSVDKGConfig(args);
});

ipcMain.handle("writeSSVDKGConfig", async (event, args) => {
  return await nodeConnection.writeSSVDKGConfig(args.serviceID, args.config);
});

ipcMain.handle("readPrometheusConfig", async (event, args) => {
  return await nodeConnection.readPrometheusConfig(args);
});

ipcMain.handle("writePrometheusConfig", async (event, args) => {
  return await nodeConnection.writePrometheusConfig(args.serviceID, args.config);
});

ipcMain.handle("getCPUTemperature", async () => {
  return await monitoring.getCPUTemperature();
});

ipcMain.handle("getValidatorStats", async (event, args) => {
  return await monitoring.getValidatorStats(args);
});

ipcMain.handle("getValidatorState", async (event, args) => {
  return await monitoring.getValidatorState(args);
});

ipcMain.handle("getQRCode", async () => {
  return await monitoring.getQRCode();
});

ipcMain.handle("checkActiveValidators", async (event, args) => {
  return await validatorAccountManager.checkActiveValidators(
    args.files,
    args.passwordFiles,
    args.password,
    args.serviceID,
    args.slashingDB,
    args.isRemote
  );
});

ipcMain.handle("exitValidatorAccount", async (event, args) => {
  return await monitoring.exitValidatorAccount(args.pubkey, args.serviceID);
});

ipcMain.handle("getExitValidatorMessage", async (event, args) => {
  return await validatorAccountManager.getExitValidatorMessage(args.pubkey, args.serviceID);
});

ipcMain.handle("exportConfig", async () => {
  return await serviceManager.exportConfig();
});

ipcMain.handle("importConfig", async (event, args) => {
  return await serviceManager.importConfig(args.configServices, args.removedServices, args.checkPointSync);
});

ipcMain.handle("importRemoteKeys", async (event, args) => {
  return await validatorAccountManager.importRemoteKeys(args.serviceID, args.pubkeys, args.url);
});

ipcMain.handle("listRemoteKeys", async (event, args) => {
  return await validatorAccountManager.listRemoteKeys(args);
});

ipcMain.handle("deleteRemoteKeys", async (event, args) => {
  return await validatorAccountManager.deleteRemoteKeys(args.serviceID, args.pubkeys);
});

ipcMain.handle("checkRemoteKeys", async (event, args) => {
  return await validatorAccountManager.checkRemoteKeys(args.url, args.serviceID);
});

ipcMain.handle("getCurrentEpochSlot", async (event, args) => {
  return await monitoring.getCurrentEpochSlot(args);
});

ipcMain.handle("beginAuthSetup", async (event, args) => {
  const current_window = event.sender;
  return await authenticationService.beginAuthSetup(args.timeBased, args.increaseTimeLimit, args.enableRateLimit, current_window);
});

ipcMain.handle("finishAuthSetup", async () => {
  return await authenticationService.finishAuthSetup();
});

ipcMain.handle("authenticatorVerification", async (event, args) => {
  return await authenticationService.authenticatorVerification(args);
});

ipcMain.handle("removeAuthenticator", async (event, args) => {
  return await authenticationService.removeAuthenticator(args);
});

ipcMain.handle("checkForAuthenticator", async (event, args) => {
  return await authenticationService.checkForAuthenticator(args);
});

ipcMain.handle("cancelVerification", async (event, args) => {
  return await sshService.cancelVerification(args);
});

ipcMain.handle("changePassword", async (event, args) => {
  return await nodeConnection.sshService.changePassword(args);
});

ipcMain.handle("readSSHKeyFile", async (event, args) => {
  return await nodeConnection.sshService.readSSHKeyFile(args);
});

ipcMain.handle("writeSSHKeyFile", async (event, args) => {
  return await nodeConnection.sshService.writeSSHKeyFile(args);
});

ipcMain.handle("generateSSHKeyPair", async (event, args) => {
  return await nodeConnection.sshService.generateSSHKeyPair(args);
});

ipcMain.handle("AddExistingSSHKey", async (event, args) => {
  const publicKey = readFileSync(args, {
    encoding: "utf8",
  });
  const existingSSHKeys = await nodeConnection.sshService.readSSHKeyFile();
  return await nodeConnection.sshService.writeSSHKeyFile([...existingSSHKeys, publicKey]);
});

ipcMain.handle("IpScanLan", async () => {
  return await nodeConnection.IpScanLan();
});

ipcMain.handle("beaconchainMonitoringModification", async (event, args) => {
  return await serviceManager.beaconchainMonitoringModification(args);
});

ipcMain.handle("removeBeaconchainMonitoring", async (event, args) => {
  return await serviceManager.removeBeaconchainMonitoring(args);
});

ipcMain.handle("dumpDockerLogs", async () => {
  return await nodeConnection.dumpDockerLogs();
});

ipcMain.handle("getCurrentEpochandSlot", async () => {
  return await monitoring.getCurrentEpochandSlot();
});

ipcMain.handle("getValidatorDuties", async (event, args) => {
  return await monitoring.getValidatorDuties(args);
});

ipcMain.handle("getAttestationRewards", async (event, args) => {
  return await monitoring.getAttestationRewards(args);
});

ipcMain.handle("getBlockRewards", async (event, args) => {
  return await monitoring.getBlockRewards(args);
});

ipcMain.handle("getSyncCommitteeRewards", async (event, args) => {
  return await monitoring.getSyncCommitteeRewards(args.validators, args.slot);
});

ipcMain.handle("createObolENR", async (event, args) => {
  return await validatorAccountManager.createObolENR(args);
});

ipcMain.handle("getObolENRPrivateKey", async () => {
  return await validatorAccountManager.getObolENRPrivateKey();
});

ipcMain.handle("checkObolContent", async () => {
  return await validatorAccountManager.checkObolContent();
});

ipcMain.handle("getObolENRPublicKey", async () => {
  return await validatorAccountManager.getObolENRPublicKey();
});

ipcMain.handle("removeObolENR", async () => {
  return await validatorAccountManager.removeObolENR();
});

ipcMain.handle("removeObolCluster", async () => {
  return await validatorAccountManager.removeObolCluster();
});

ipcMain.handle("startObolDKG", async (event, args) => {
  return await validatorAccountManager.startObolDKG(args);
});

ipcMain.handle("checkObolDKG", async () => {
  return await validatorAccountManager.checkObolDKG();
});

ipcMain.handle("getObolDKGLogs", async () => {
  return await validatorAccountManager.getObolDKGLogs();
});

ipcMain.handle("downloadObolBackup", async (event, args) => {
  return await validatorAccountManager.downloadObolBackup(args);
});

ipcMain.handle("importObolBackup", async (event, args) => {
  return await validatorAccountManager.importObolBackup(args);
});

ipcMain.handle("copyExecutionJWT", async (event, args) => {
  return await serviceManager.copyExecutionJWT(args);
});

ipcMain.handle("readMultiSetup", async () => {
  return await configManager.readMultiSetup();
});

ipcMain.handle("createSetup", async (event, args) => {
  return await configManager.createSetup(args);
});

ipcMain.handle("deleteSetup", async (event, args) => {
  return await configManager.deleteSetup(args);
});

ipcMain.handle("renameSetup", async (event, args) => {
  return await configManager.renameSetup(args);
});

ipcMain.handle("exportSingleSetup", async (event, args) => {
  return await serviceManager.exportSingleSetup(args);
});

ipcMain.handle("importSingleSetup", async (event, args) => {
  return await serviceManager.importSingleSetup(args);
});

ipcMain.handle("switchSetupNetwork", async (event, args) => {
  return await configManager.switchSetupNetwork(args);
});

ipcMain.handle("fetchTranslators", async (event, args) => {
  return await serviceManager.fetchTranslators(args);
});

ipcMain.handle("fetchGitHubTesters", async (event, args) => {
  return await serviceManager.fetchGitHubTesters(args);
});

ipcMain.handle("checkAndCreateMultiSetup", async () => {
  return await configManager.checkAndCreateMultiSetup();
});

ipcMain.handle("checkConnectionQuality", async (event, args) => {
  return await nodeConnection.sshService.checkConnectionQuality(args);
});

ipcMain.handle("writeGenesisJsonDevnet", async (event, args) => {
  return await serviceManager.writeGenesisJsonDevnet(args);
});

ipcMain.handle("writeConfigYamlDevnet", async (event, args) => {
  return await serviceManager.writeConfigYamlDevnet(args);
});

ipcMain.handle("initGenesis", async () => {
  return await serviceManager.initGenesis();
});

ipcMain.handle("removeConfigGenesisCopy", async () => {
  return await serviceManager.removeConfigGenesisCopy();
});

ipcMain.handle("startServicesForSetup", async (event, args) => {
  return await serviceManager.startServicesForSetup(args);
});

ipcMain.handle("startShell", async (event) => {
  if (!nodeConnection.sshService.shellStream) {
    try {
      await nodeConnection.sshService.startShell(
        nodeConnection.nodeConnectionParams,
        (output) => {
          event.sender.send("terminal-output", output.toString());
        },
        (error) => {
          console.error("SSH Shell Error:", error);
          event.sender.send("terminal-output", `Error: ${error.message}`);
        }
      );
    } catch (error) {
      console.error("Error starting shell:", error);
      return `Error starting shell: ${error.message}`;
    }
  }
});

ipcMain.handle("exec", async (event, command, use_sudo) => {
  return await nodeConnection.sshService.exec(command, use_sudo);
});

ipcMain.handle("executeCommand", async (event, args) => {
  return await nodeConnection.sshService.executeCommand(args);
});

ipcMain.handle("stopShell", async () => {
  if (nodeConnection.sshService) {
    try {
      nodeConnection.sshService.stopShell();
    } catch (error) {
      console.error("Error stopping shell:", error);
      return `Error stopping shell: ${error.message}`;
    }
  }
});

ipcMain.handle("create2FAQRCode", async (event, args) => {
  return await authenticationService.create2FAQRCode(args.type, args.name, args.ip, args.secret);
});

ipcMain.handle("createGasConfigFile", async (event, args) => {
  return await tekuGasLimitConfig.createGasConfigFile(args.gasLimit, args.feeRecipient, args.configPath);
});

ipcMain.handle("removeGasConfigFile", async (event, args) => {
  return await tekuGasLimitConfig.removeGasConfigFile(args);
});

ipcMain.handle("readGasConfigFile", async (event, args) => {
  return await tekuGasLimitConfig.readGasConfigFile(args);
});

ipcMain.handle("handleOTPChange", async (event, args) => {
  return await AuthenticationService.handleOTPChange(
    nodeConnection.nodeConnectionParams.password,
    args.newPassword,
    nodeConnection.sshService
  );
});

ipcMain.handle("fetchObolCharonAlerts", async () => {
  return await monitoring.fetchObolCharonAlerts();
});

ipcMain.handle("getSubnetSubs", async () => {
  return await monitoring.getSubnetSubs();
});

ipcMain.handle("fetchCsmAlerts", async () => {
  return await monitoring.fetchCsmAlerts();
});

ipcMain.handle("ignoreUpdate", async (event) => {
  return await stereumUpdater.ignoreUpdate(event.sender);
});

ipcMain.handle("updateLauncher", async () => {
  return stereumUpdater.downloadUpdate();
});

ipcMain.handle("getNewLauncherVersion", async () => {
  return stereumUpdater.getNewLauncherVersion();
});

ipcMain.handle("deleteSlasherVolume", async (event, args) => {
  return await serviceManager.deleteSlasherVolume(args);
});

ipcMain.handle("fetchCurrentTimeZone", async () => {
  return await monitoring.fetchCurrentTimeZone();
});

ipcMain.handle("getCSMQueue", async (event, args) => {
  return await checkSigningKeys(args.keysArray, monitoring);
});

ipcMain.handle("getObolClusterInformation", async (event, args) => {
  return await monitoring.getObolClusterInformation(args.serviceID);
});

ipcMain.handle("getSSVClusterInformation", async (event, args) => {
  return await monitoring.getSSVClusterInformation(args.serviceID);
});

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { secure: true, standard: true } }]);

let mainWindow = null;
async function createWindow(type = "main") {
  // Create the browser window.

  const initwin = {
    width: 1044,
    height: 609,
    minHeight: 609,
    minWidth: 1044,
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      // devTools: false,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  };
  if (!isDevelopment) {
    initwin["maxHeight"] = 609;
    initwin["maxWidth"] = 1044;
  }
  if (!isDevelopment && process.platform === "win32") {
    initwin["minHeight"] = 650;
    initwin["minWidth"] = 1100;
    initwin["maxHeight"] = 650;
    initwin["maxWidth"] = 1100;
  }

  const win = new BrowserWindow(initwin);

  win.setMenuBarVisibility(false);

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    if (type === "update") {
      await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL + "#/update");
    } else {
      await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
    }
    if (!process.env.IS_TEST) win.webContents.openDevTools();
  } else {
    createProtocol("app");
    // Load the index.html when not in developmen
    if (type === "update") {
      win.loadURL("app://./index.html#/update");
    } else {
      win.loadURL("app://./index.html");
    }

    mainWindow = win;
    return win;
  }

  win.on("ready-to-show", async () => {
    await nodeConnection.closeTunnels();
  });
  let closeHandler;
  switch (type) {
    case "main": {
      closeHandler = (e) => {
        if (app.showExitPrompt) {
          e.preventDefault(); // Prevents the window from closing
          const response = dialog.showMessageBoxSync({
            type: "question",
            buttons: ["Yes", "No"],
            title: "Confirm",
            message: "Critical tasks are running in the background.\nAre you sure you want to quit?",
            icon: "./public/img/icon/node-journal-icons/red-warning.png",
          });
          if (response === 0) {
            app.showExitPrompt = false;
            win.close();
          }
        }
      };
      break;
    }
    case "update": {
      closeHandler = (e) => {
        if (app.showExitPrompt) {
          e.preventDefault(); // Prevents the window from closing
          const response = dialog.showMessageBoxSync({
            type: "question",
            buttons: ["Yes", "No"],
            title: "Confirm",
            message: "Stereum is updating.\nAre you sure you want to quit?",
            icon: "./public/img/icon/node-journal-icons/red-warning.png",
          });
          if (response === 0) {
            app.showExitPrompt = false;
            stereumUpdater.updateWindow = null;
            win.close();
          }
        }
      };
      break;
    }
  }

  win.on("close", closeHandler);

  //
  ipcMain.handle("openDirectoryDialog", async (event, args) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, args);
    if (canceled) return [];
    return filePaths;
  });

  ipcMain.handle("openFilePicker", async (event, dialog_options, read_content = false) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, dialog_options);
    if (canceled) return [];
    const fileList = [];
    for (const filePath of filePaths) {
      try {
        if (read_content) {
          const content = readFileSync(filePath, "utf-8");
          fileList.push({ path: filePath, name: path.basename(filePath), content: content });
        } else {
          fileList.push({ path: filePath, name: path.basename(filePath) });
        }
      } catch (error) {
        log.error("Failed reading local file: ", error);
      }
    }
    return fileList;
  });

  return win;
}

// Disable CTRL+R and F5 in build
if (!isDevelopment) {
  app.on("browser-window-focus", function () {
    globalShortcut.register("CommandOrControl+R", () => {});
    globalShortcut.register("F5", () => {});
  });
  app.on("browser-window-blur", function () {
    globalShortcut.unregister("CommandOrControl+R");
    globalShortcut.unregister("F5");
  });
}

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  nodeConnection.logout();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("web-contents-created", (event, contents) => {
  contents.setWindowOpenHandler((details) => {
    const parsedUrl = new url.URL(details.url);
    if (["https:", "http:", "mailto:"].includes(parsedUrl.protocol)) {
      shell.openExternal(parsedUrl.href);
    }
    return { action: "deny" };
  });
});

app.on("ready", async () => {
  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Development mode
    app.setAsDefaultProtocolClient("stereumlauncher", process.execPath, [path.resolve(process.argv[1])]);
  } else {
    // Production mode
    app.setAsDefaultProtocolClient("stereumlauncher");

    // Disable "View" and "Window" Menu items in build
    const hideMenuItems = ["viewmenu", "windowmenu"];
    var menu = Menu.getApplicationMenu();
    menu.items.filter((item) => hideMenuItems.includes(item.role)).map((item) => (item.visible = false));
    Menu.setApplicationMenu(menu);

    // Check for updates in production
    stereumUpdater.checkForUpdates();
  }

  await createWindow();
});

// Handle the protocol on Windows and Linux
if (process.platform === "win32" || process.platform === "linux") {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", async (event, argv) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();

        const url = argv.find((arg) => arg.startsWith("stereumlauncher://"));
        if (url) {
          await protocolHandler.handleCustomUrl(url);
        }
      }
    });
  }
}

// Handle the protocol on macOS
if (process.platform === "darwin") {
  app.on("open-url", async (event, url) => {
    event.preventDefault();

    // If app is not ready, wait for it
    if (!mainWindow) {
      app.on("ready", async () => {
        await protocolHandler.handleCustomUrl(url);
      });
    } else {
      await protocolHandler.handleCustomUrl(url);
    }
  });
}

// Handle URLs from command line arguments (works for all platforms)
app.on("ready", async () => {
  const protocolUrl = process.argv.find((arg) => arg.startsWith("stereumlauncher://"));
  if (protocolUrl) {
    await protocolHandler.handleCustomUrl(protocolUrl);
  }
});

if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", (data) => {
      if (data === "graceful-exit") {
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      app.quit();
    });
  }
}
