export const STARTING_BALANCE = 1000000;

export const MAPS = [
  {
    id: 'london',
    name: { ru: 'Лондон', en: 'London' },
    subtitle: { ru: 'Классический клуб • 8-Ball', en: 'Classic Club • 8-Ball' },
    mode: '8ball',
    bet: 1000,
    turnTime: 45,
    ballInHandRule: 'standard',
    physics: {
      slideFriction: 0.21,
      rollFriction: 0.015,
      spinDecay: 2.6,
      restitutionBall: 0.95,
      restitutionRail: 0.76,
      pocketRadiusScale: 1.04
    },
    theme: {
      clothColor: '#9e1f1c',
      clothAccent: '#6b1110',
      cushionColor: '#7d1513',
      railColor: '#3d1e12',
      railSecondary: '#221009',
      railTrim: '#d4af37',
      emblemType: 'crown'
    }
  },
  {
    id: 'tokyo',
    name: { ru: 'Токио', en: 'Tokyo' },
    subtitle: { ru: 'Неоновый квартал • Быстрое сукно', en: 'Neon District • Fast Cloth' },
    mode: '8ball',
    bet: 5000,
    turnTime: 45,
    ballInHandRule: 'standard',
    physics: {
      slideFriction: 0.17,
      rollFriction: 0.011,
      spinDecay: 2.2,
      restitutionBall: 0.96,
      restitutionRail: 0.80,
      pocketRadiusScale: 0.93
    },
    theme: {
      clothColor: '#1f4f59',
      clothAccent: '#123138',
      cushionColor: '#176b7a',
      railColor: '#131926',
      railSecondary: '#0a0e17',
      railTrim: '#00f5d4',
      emblemType: 'torii'
    }
  },
  {
    id: 'cairo',
    name: { ru: 'Каир', en: 'Cairo' },
    subtitle: { ru: 'Песчаные дюны • 9-Ball', en: 'Sand Dunes • 9-Ball' },
    mode: '9ball',
    bet: 10000,
    turnTime: 40,
    ballInHandRule: 'standard',
    physics: {
      slideFriction: 0.25,
      rollFriction: 0.020,
      spinDecay: 3.0,
      restitutionBall: 0.94,
      restitutionRail: 0.73,
      pocketRadiusScale: 1.0
    },
    theme: {
      clothColor: '#8c6227',
      clothAccent: '#593d16',
      cushionColor: '#734f1d',
      railColor: '#2e2012',
      railSecondary: '#1c130a',
      railTrim: '#f59e0b',
      emblemType: 'pyramid'
    }
  },
  {
    id: 'moscow',
    name: { ru: 'Москва', en: 'Moscow' },
    subtitle: { ru: 'Строгие борта • Таймер 30 с', en: 'Hard Rails • 30s Timer' },
    mode: '8ball',
    bet: 50000,
    turnTime: 30,
    ballInHandRule: 'kitchen',
    physics: {
      slideFriction: 0.20,
      rollFriction: 0.014,
      spinDecay: 2.5,
      restitutionBall: 0.95,
      restitutionRail: 0.85,
      pocketRadiusScale: 0.91
    },
    theme: {
      clothColor: '#1d283a',
      clothAccent: '#101722',
      cushionColor: '#162030',
      railColor: '#261419',
      railSecondary: '#140a0d',
      railTrim: '#f43f5e',
      emblemType: 'star'
    }
  },
  {
    id: 'vegas',
    name: { ru: 'Лас-Вегас', en: 'Las Vegas' },
    subtitle: { ru: 'Гранд Роял • Шар в руке', en: 'Grand Royale • Ball in Hand' },
    mode: '8ball',
    bet: 100000,
    turnTime: 45,
    ballInHandRule: 'any_foul',
    physics: {
      slideFriction: 0.19,
      rollFriction: 0.013,
      spinDecay: 2.4,
      restitutionBall: 0.96,
      restitutionRail: 0.78,
      pocketRadiusScale: 0.96
    },
    theme: {
      clothColor: '#14532d',
      clothAccent: '#092e18',
      cushionColor: '#0f4223',
      railColor: '#1c1917',
      railSecondary: '#0c0a09',
      railTrim: '#fbbf24',
      emblemType: 'spade'
    }
  }
];

export function getMapById(id) {
  return MAPS.find(m => m.id === id) || MAPS[0];
}