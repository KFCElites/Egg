import dayjs, { Dayjs } from 'dayjs';
import { Memoize } from 'typescript-memoize';

import {
  ei,
  Mission,
  missionDurationTypeList,
  MissionType,
  newMissionTypeMap,
  newShipsConfig,
  requiredTotalLaunchesToUnlockNextShip,
  shipLevelLaunchPointThresholds,
  ShipsConfig,
  spaceshipIconPath,
  spaceshipList,
  spaceshipName,
} from 'lib';

import Spaceship = ei.MissionInfo.Spaceship;
import DurationType = ei.MissionInfo.DurationType;

export class Statistics {
  config: ShipsConfig;
  ships: ShipStatistics[];

  constructor(config: ShipsConfig, ships: ShipStatistics[]) {
    this.config = config;
    this.ships = ships;
  }
}

export class ShipStatistics {
  config: ShipsConfig;
  shipType: Spaceship;
  durations: MissionTypeStatistics[];

  constructor(config: ShipsConfig, shipType: Spaceship, durationTypes?: MissionTypeStatistics[]) {
    this.config = config;
    this.shipType = shipType;
    this.durations = durationTypes || [];
  }

  get shipName(): string {
    return spaceshipName(this.shipType);
  }

  get shipIconPath(): string {
    return spaceshipIconPath(this.shipType);
  }

  get count(): number {
    return this.durations.reduce((count, dt) => count + dt.count, 0);
  }

  @Memoize()
  get launchPoints(): number {
    return this.durations.reduce((lp, dt) => lp + dt.launchPoints, 0);
  }

  @Memoize()
  get levelLaunchPointThresholds(): number[] {
    return shipLevelLaunchPointThresholds(this.shipType);
  }

  @Memoize()
  get launchPointsProgress(): {
    maxLevel: number;
    level: number;
    launchPointsToNextLevel: number | null;
    launchPointsToMaxLevel: number | null;
  } {
    const launchPoints = this.launchPoints;
    const thresholds = this.levelLaunchPointThresholds;
    const maxLevel = thresholds.length - 1;
    const finalThreshold = thresholds[maxLevel];
    const launchPointsToMaxLevel =
      finalThreshold > launchPoints ? finalThreshold - launchPoints : null;
    let level = 0;
    for (; level < thresholds.length; level++) {
      if (launchPoints >= thresholds[level]) {
        continue;
      }
      return {
        maxLevel,
        level: level - 1,
        launchPointsToNextLevel: thresholds[level] - launchPoints,
        launchPointsToMaxLevel,
      };
    }
    return {
      maxLevel,
      level,
      launchPointsToNextLevel: null,
      launchPointsToMaxLevel,
    };
  }

  @Memoize()
  get maxLevel(): number {
    return this.launchPointsProgress.maxLevel;
  }

  @Memoize()
  get currentLevel(): number {
    return this.launchPointsProgress.level;
  }

  // null if already at the final level.
  @Memoize()
  get launchPointsToNextLevel(): number | null {
    return this.launchPointsProgress.launchPointsToNextLevel;
  }

  get shortMissionsToNextLevel(): number {
    return Math.ceil((this.launchPointsToNextLevel || 0) / 1);
  }

  get standardMissionsToNextLevel(): number {
    return Math.ceil((this.launchPointsToNextLevel || 0) / 1.4);
  }

  get extendedMissionsToNextLevel(): number {
    return Math.ceil((this.launchPointsToNextLevel || 0) / 1.8);
  }

  // null if already at the final level.
  @Memoize()
  get launchPointsToMaxLevel(): number | null {
    return this.launchPointsProgress.launchPointsToMaxLevel;
  }

  get shortMissionsToMaxLevel(): number {
    return Math.ceil((this.launchPointsToMaxLevel || 0) / 1);
  }

  get standardMissionsToMaxLevel(): number {
    return Math.ceil((this.launchPointsToMaxLevel || 0) / 1.4);
  }

  get extendedMissionsToMaxLevel(): number {
    return Math.ceil((this.launchPointsToMaxLevel || 0) / 1.8);
  }

  get requiredTotalLaunchesToUnlockNextShip(): number {
    return requiredTotalLaunchesToUnlockNextShip(this.shipType);
  }

  get requiredRemainingLaunchesToUnlockNextShip(): number {
    return Math.max(this.requiredTotalLaunchesToUnlockNextShip - this.count, 0);
  }
}

export class MissionTypeStatistics {
  mission: MissionType;
  count: number;

  constructor(shipType: Spaceship, durationType: DurationType, count = 0) {
    this.mission = new MissionType(shipType, durationType);
    this.count = count;
  }

  get launchPoints(): number {
    switch (this.mission.durationType) {
      case DurationType.TUTORIAL:
      case DurationType.SHORT:
        return this.count * 1;
      case DurationType.LONG:
        return this.count * 1.4;
      case DurationType.EPIC:
        return this.count * 1.8;
    }
  }
}

// Sorted in chronological order.
export function getLaunchedMissions(artifactsDB: ei.IArtifactsDB): ei.IMissionInfo[] {
  return (artifactsDB.missionArchive || [])
    .concat(artifactsDB.missionInfos || [])
    .filter(m => m.status! >= ei.MissionInfo.Status.EXPLORING)
    .sort((m1, m2) => m1.startTimeDerived! - m2.startTimeDerived!);
}

export function getMissionStatistics(
  artifactsDB: ei.IArtifactsDB,
  progress: ei.Backup.IGame
): Statistics {
  const missions = getLaunchedMissions(artifactsDB);
  const missionTypeCounts = newMissionTypeMap(0);
  for (const mission of missions) {
    missionTypeCounts[mission.ship!][mission.durationType!]++;
  }
  const config = newShipsConfig(progress);
  const ships = [];
  for (const shipType of spaceshipList) {
    const shipStats = new ShipStatistics(config, shipType);
    for (const durationType of missionDurationTypeList) {
      const count = missionTypeCounts[shipType][durationType];
      if (count > 0) {
        shipStats.durations.push(new MissionTypeStatistics(shipType, durationType, count));
      }
    }
    if (shipStats.durations.length > 0) {
      ships.push(shipStats);
      config.shipLevels[shipType] = shipStats.currentLevel;
    }
  }
  return new Statistics(config, ships);
}

export class LaunchLog {
  dates: DailyLaunchLog[];

  constructor() {
    this.dates = [];
  }

  addDate(date: Dayjs, missions: Mission[]): void {
    this.dates.push(new DailyLaunchLog(date, missions));
  }

  sort(): void {
    this.dates.sort((d1, d2) => d2.date.valueOf() - d1.date.valueOf());
  }

  filtered(lastNDays?: number): DailyLaunchLog[] {
    const dateCutoff = lastNDays
      ? dayjs()
          .startOf('day')
          .subtract(lastNDays - 1, 'days')
      : dayjs(0);
    return this.dates.filter(date => !date.date.isBefore(dateCutoff));
  }
}

export class DailyLaunchLog {
  date: Dayjs;
  missions: Mission[];

  constructor(date: Dayjs, missions: Mission[]) {
    this.date = date;
    this.missions = missions.sort((m1, m2) => m2.launchTimestamp! - m1.launchTimestamp!);
  }

  get dateDisplay(): string {
    return this.date.format('YYYY-MM-DD');
  }
}

export function getLaunchLog(artifactsDB: ei.IArtifactsDB): LaunchLog {
  type EpochMilliseconds = number;
  const missions = getLaunchedMissions(artifactsDB).map(m => new Mission(m));
  const dateToMissions = new Map<EpochMilliseconds, Mission[]>();
  for (const mission of missions) {
    const launchTime = mission.launchTime;
    if (!launchTime) {
      throw new Error(`mission ${mission.id}: launch timestamp not found`);
    }
    const dateTimestamp: EpochMilliseconds = launchTime.startOf('day').valueOf();
    if (dateToMissions.has(dateTimestamp)) {
      dateToMissions.get(dateTimestamp)!.push(mission);
    } else {
      dateToMissions.set(dateTimestamp, [mission]);
    }
  }
  const log = new LaunchLog();
  dateToMissions.forEach((missions, date) => {
    log.addDate(dayjs(date), missions);
  });
  log.sort();
  return log;
}
