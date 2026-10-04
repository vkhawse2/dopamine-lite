import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { LyricsModel } from '../../../../../services/lyrics/lyrics-model';
import { PlaybackService } from '../../../../../services/playback/playback.service';
import { SettingsBase } from '../../../../../common/settings/settings.base';
import { RichLyricsCalculator } from './rich-lyrics-calculator';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-rich-lyrics',
    host: { style: 'display: block; width: 100%; height: 100%;' },
    templateUrl: './rich-lyrics.component.html',
    styleUrls: ['./rich-lyrics.component.scss'],
    encapsulation: ViewEncapsulation.None,
})
export class RichLyricsComponent implements OnChanges, OnDestroy {
    private readonly minimumRichLyricSize: number = 0.5;

    @Input() public lyrics!: LyricsModel;

    public cText: string = '';
    public nText: string = '';
    public pText: string = '';
    public mainRichLyricSize: number = 2;
    public sideRichLyricSize: number = 2;

    private calculator: RichLyricsCalculator = new RichLyricsCalculator();
    private lyricInterval: ReturnType<typeof setInterval> | undefined;
    private subscription: Subscription = new Subscription();
    private lastFontSizeIndex: number = -1;

    public constructor(
        private playbackService: PlaybackService,
        private cd: ChangeDetectorRef,
        private settings: SettingsBase,
    ) {}

    public get percentage(): string {
        return String(this.calculator.percentage);
    }

    public get hasEndTimes(): boolean {
        return this.lyrics?.endTimeStamps != undefined && this.lyrics.endTimeStamps.length > 0;
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['lyrics']) {
            this.stopTimers();
            this.calculator.reset();
            this.lastFontSizeIndex = -1;
            this.setRichLyricSize();
            this.startTimers();
        }
    }

    public ngOnDestroy(): void {
        this.stopTimers();
        this.subscription.unsubscribe();
    }

    private startTimers(): void {
        this.subscription.add(
            this.playbackService.playbackSkipped$.subscribe(() => {
                this.calculator.reset();
            }),
        );

        this.subscription.add(
            this.playbackService.playbackStarted$.subscribe(() => {
                this.calculator.reset();
            }),
        );

        this.lyricInterval = setInterval(() => {
            if (this.lyrics == undefined) {
                return;
            }

            const currentTime = this.playbackService.getCurrentProgress().progressSeconds;
            this.calculator.updateCurrentLyric(this.lyrics, currentTime);
            this.cText = this.calculator.getCurrentText(this.lyrics);

            // The 100 Hz percent timer is gone: 4 Hz is plenty for a lyric progress bar.
            if (this.hasEndTimes) {
                this.calculator.calculatePercentage(this.lyrics, currentTime);
            }

            const lineCount = this.settings.richLyricsLineCount;
            const totalLines = this.lyrics.textLines?.length ?? 0;
            const currentIdx = this.calculator.currentIndex;
            const availablePrev = Math.min(lineCount, currentIdx);
            const availableNext = Math.min(lineCount, totalLines - 1 - currentIdx);
            const prevCount = Math.min(lineCount + (lineCount - availableNext), currentIdx);
            const nextCount = Math.min(lineCount + (lineCount - availablePrev), totalLines - 1 - currentIdx);

            this.nText = this.calculator.getNextLines(this.lyrics, nextCount);
            this.pText = this.calculator.getPreviousLines(this.lyrics, prevCount);

            // Font sizing needs layout reads; only redo it when the active line changes,
            // not on every tick.
            if (currentIdx !== this.lastFontSizeIndex) {
                this.lastFontSizeIndex = currentIdx;
                this.calculateFontSize();
            }

            this.cd.detectChanges();
        }, 250);
    }

    private stopTimers(): void {
        if (this.lyricInterval != undefined) {
            clearInterval(this.lyricInterval);
            this.lyricInterval = undefined;
        }
    }

    private setRichLyricSize(): void {
        this.mainRichLyricSize = this.settings.richLyricsFontSize;
        this.sideRichLyricSize = this.settings.richLyricsFontSize;
    }

    private calculateFontSize(): void {
        const main = document.getElementsByClassName('rich-main')[0] as HTMLElement;

        if (main == undefined) {
            return;
        }

        // Shrink-to-fit using direct DOM writes (each read forces a sync layout, no
        // Angular change detection needed mid-loop), then sync the binding once.
        // Template binds: [style.font-size]="mainRichLyricSize * 2 + 'vmin'".
        let size: number = this.settings.richLyricsFontSize;
        main.style.fontSize = `${size * 2}vmin`;

        while (size > this.minimumRichLyricSize && main.offsetWidth < main.scrollWidth) {
            size = Math.max(this.minimumRichLyricSize, size - 0.05);
            main.style.fontSize = `${size * 2}vmin`;
        }

        this.mainRichLyricSize = size;
        this.cd.detectChanges();
    }
}
