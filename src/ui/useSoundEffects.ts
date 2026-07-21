import { useCallback, useEffect, useRef, useState } from "react";

import { recordGenerationDiagnostic } from "../api/diagnostics";

type SoundEffectId = "button" | "chapter" | "talk" | "yourTurn" | "memberShow";

const SOUND_EFFECT_SOURCES: Record<SoundEffectId, string> = {
  button: "/sfx/buttonpress.mp3",
  chapter: "/sfx/chapterchange.mp3",
  talk: "/sfx/talksound.wav",
  yourTurn: "/sfx/yourturn.mp3",
  memberShow: "/sfx/membershow.m4a",
};

const SOUND_EFFECT_VOLUMES: Record<SoundEffectId, number> = {
  button: 0.2,
  chapter: 0.3,
  talk: 0.28,
  yourTurn: 0.3,
  memberShow: 0.22,
};

const TALK_POOL_SIZE = 3;
const TALK_THROTTLE_MS = 70;
const MEMBER_SOUND_SUPPRESSION_MS = 1_800;

type SoundPool = Record<SoundEffectId, HTMLAudioElement[]>;

function createAudio(source: string, volume: number) {
  const audio = document.createElement("audio");
  audio.src = source;
  audio.preload = "auto";
  audio.volume = volume;
  return audio;
}

class SoundEffectPlayer {
  private readonly sounds: SoundPool;
  private readonly reportedPlaybackFailures = new Set<SoundEffectId>();
  private talkPoolCursor = 0;
  private lastTalkSoundAt = 0;
  private suppressMemberSoundUntil = 0;

  constructor() {
    this.sounds = Object.fromEntries(
      (Object.keys(SOUND_EFFECT_SOURCES) as SoundEffectId[]).map((id) => [
        id,
        Array.from({ length: id === "talk" ? TALK_POOL_SIZE : 1 }, () =>
          createAudio(SOUND_EFFECT_SOURCES[id], SOUND_EFFECT_VOLUMES[id]),
        ),
      ]),
    ) as SoundPool;
  }

  private stop(id: SoundEffectId) {
    this.sounds[id].forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }

  private play(id: SoundEffectId) {
    const pool = this.sounds[id];
    const poolIndex = id === "talk" ? this.talkPoolCursor++ % pool.length : 0;
    const audio = pool[poolIndex];
    audio.currentTime = 0;
    void audio.play().catch(() => {
      if (this.reportedPlaybackFailures.has(id)) return;
      this.reportedPlaybackFailures.add(id);
      recordGenerationDiagnostic({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        endpoint: `sfx-${id}`,
        outcome: "failure",
        status: 0,
        durationMs: 0,
        code: "playback_failed",
        detail: "The browser could not play this sound effect.",
      });
    });
  }

  playButton() {
    this.play("button");
  }

  playChapterChange() {
    this.suppressMemberSoundUntil = performance.now() + MEMBER_SOUND_SUPPRESSION_MS;
    this.stop("memberShow");
    this.play("chapter");
  }

  playMemberShow() {
    if (performance.now() < this.suppressMemberSoundUntil) return;
    this.play("memberShow");
  }

  playYourTurn() {
    this.play("yourTurn");
  }

  playTalkTick() {
    const now = performance.now();
    if (now - this.lastTalkSoundAt < TALK_THROTTLE_MS) return;
    this.lastTalkSoundAt = now;
    this.play("talk");
  }

  stopTalk() {
    this.stop("talk");
  }

  stopAll() {
    (Object.keys(this.sounds) as SoundEffectId[]).forEach((id) => this.stop(id));
  }

  destroy() {
    this.stopAll();
    Object.values(this.sounds).forEach((pool) => {
      pool.forEach((audio) => audio.removeAttribute("src"));
    });
  }
}

export function useSoundEffects() {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);
  const playerRef = useRef<SoundEffectPlayer | null>(null);

  useEffect(() => {
    const player = new SoundEffectPlayer();
    playerRef.current = player;

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  const playButton = useCallback(() => {
    if (enabledRef.current) playerRef.current?.playButton();
  }, []);
  const playChapterChange = useCallback(() => {
    if (enabledRef.current) playerRef.current?.playChapterChange();
  }, []);
  const playMemberShow = useCallback(() => {
    if (enabledRef.current) playerRef.current?.playMemberShow();
  }, []);
  const playYourTurn = useCallback(() => {
    if (enabledRef.current) playerRef.current?.playYourTurn();
  }, []);
  const playTalkTick = useCallback(() => {
    if (enabledRef.current) playerRef.current?.playTalkTick();
  }, []);
  const stopTalk = useCallback(() => playerRef.current?.stopTalk(), []);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      enabledRef.current = next;
      if (!next) playerRef.current?.stopAll();
      return next;
    });
  }, []);

  useEffect(() => {
    const handleButtonClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!(button instanceof HTMLButtonElement) || button.disabled || button.dataset.soundless === "true") return;
      playButton();
    };

    document.addEventListener("click", handleButtonClick);
    return () => document.removeEventListener("click", handleButtonClick);
  }, [playButton]);

  return {
    enabled,
    toggle,
    playChapterChange,
    playMemberShow,
    playYourTurn,
    playTalkTick,
    stopTalk,
  };
}
