import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LobbyListComponent } from './lobby-list';

describe('LobbyListComponent', () => {
    let component: LobbyListComponent;
    let fixture: ComponentFixture<LobbyListComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [LobbyListComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(LobbyListComponent);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
