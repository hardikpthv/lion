import {
  expect,
  fixture as _fixture,
  fixtureSync as _fixtureSync,
  html,
  defineCE,
  unsafeStatic,
  aTimeout,
} from '@open-wc/testing';
import sinon from 'sinon';
import { mimicUserInput } from '@lion/form-core/test-helpers';
import { localize } from '@lion/localize';
import { LionInputTel } from '../src/LionInputTel.js';
import { IsPhoneNumber } from '../src/validators.js';
import { PhoneUtilManager } from '../src/PhoneUtilManager.js';
import {
  mockPhoneUtilManager,
  restorePhoneUtilManager,
} from '../test-helpers/mockPhoneUtilManager.js';

/**
 * @typedef {import('@lion/core').TemplateResult} TemplateResult
 * @typedef {import('../types').RegionCode} RegionCode
 */

const fixture = /** @type {(arg: string | TemplateResult) => Promise<LionInputTel>} */ (_fixture);
const fixtureSync = /** @type {(arg: string | TemplateResult) => LionInputTel} */ (_fixtureSync);

// const isPhoneNumberUtilLoadComplete = el => el._phoneUtilLoadComplete;

const getRegionCodeBasedOnLocale = () => {
  const localeSplitted = localize.locale.split('-');
  return /** @type {RegionCode} */ (localeSplitted[localeSplitted.length - 1]).toUpperCase();
};

/**
 * @param {{ klass:LionInputTel }} config
 */
// @ts-ignore
export function runInputTelSuite({ klass = LionInputTel } = {}) {
  // @ts-ignore
  const tagName = defineCE(/** @type {* & HTMLElement} */ (class extends klass {}));
  const tag = unsafeStatic(tagName);

  describe('LionInputTel', () => {
    beforeEach(async () => {
      // Wait till PhoneUtilManager has been loaded
      await PhoneUtilManager.loadComplete;
    });

    describe('Region codes', () => {
      describe('Readonly accessor `.activeRegion`', () => {
        // 1. **allowed regions**: try to get the region from preconfigured allowed region (first entry)
        it('takes .allowedRegions[0] when only one allowed region configured', async () => {
          const el = await fixture(
            html` <${tag} .allowedRegions="${['DE']}" .modelValue="${'+31612345678'}" ></${tag}> `,
          );
          await el.updateComplete;
          expect(el.activeRegion).to.equal('DE');
        });

        it('returns undefined when multiple .allowedRegions, but no modelValue match', async () => {
          // involve locale, so we are sure it does not fall back on locale
          const currentCode = getRegionCodeBasedOnLocale();
          const allowedRegions = ['BE', 'DE', 'CN'];
          const el = await fixture(
            html` <${tag} .modelValue="${'+31612345678'}" .allowedRegions="${allowedRegions.filter(
              ar => ar !== currentCode,
            )}"></${tag}> `,
          );
          expect(el.activeRegion).to.equal(undefined);
        });

        // 2. **user input**: try to derive active region from user input
        it('deducts it from modelValue when provided', async () => {
          const el = await fixture(html` <${tag} .modelValue="${'+31612345678'}"></${tag}> `);
          // Region code for country code '31' is 'NL'
          expect(el.activeRegion).to.equal('NL');
        });

        it('.modelValue takes precedence over .allowedRegions when both preconfigured and .modelValue updated', async () => {
          const el = await fixture(
            html` <${tag} .allowedRegions="${[
              'DE',
              'BE',
              'NL',
            ]}" .modelValue="${'+31612345678'}" ></${tag}> `,
          );
          expect(el.activeRegion).to.equal('NL');
        });

        // 3. **locale**: try to get the region from locale (`html[lang]` attribute)
        it('automatically bases it on current locale when nothing preconfigured', async () => {
          const el = await fixture(html` <${tag}></${tag}> `);
          const currentCode = getRegionCodeBasedOnLocale();
          expect(el.activeRegion).to.equal(currentCode);
        });

        it('returns undefined when locale not within allowed regions', async () => {
          const currentCode = getRegionCodeBasedOnLocale();
          const allowedRegions = ['NL', 'BE', 'DE'];
          const el = await fixture(
            html` <${tag} .allowedRegions="${allowedRegions.filter(
              ar => ar !== currentCode,
            )}"></${tag}> `,
          );
          expect(el.activeRegion).to.equal(undefined);
        });
      });

      it('can preconfigure the region code via prop', async () => {
        const currentCode = getRegionCodeBasedOnLocale();
        const newCode = currentCode === 'DE' ? 'NL' : 'DE';
        const el = await fixture(html` <${tag} .allowedRegions="${[newCode]}"></${tag}> `);
        expect(el.activeRegion).to.equal(newCode);
      });

      it.skip('reformats when region code is changed on the fly', async () => {
        const el = await fixture(
          html` <${tag} .allowedRegions="${['NL']}" .modelValue="${'+31612345678'}"></${tag}> `,
        );
        await el.updateComplete;
        expect(el.formattedValue).to.equal('+31 6 12345678');
        el.allowedRegions = ['NL'];
        await el.updateComplete;
        expect(el.formattedValue).to.equal('612345678');
      });
    });

    describe('Readonly accessor `.activePhoneNumberType`', () => {
      const types = [
        { type: 'fixed-line', number: '030 1234567', allowedRegions: ['NL'] },
        { type: 'mobile', number: '06 12345678', allowedRegions: ['NL'] },
        // { type: 'fixed-line-or-mobile', number: '030 1234567' },
        // { type: 'pager', number: '06 12345678' },
        // { type: 'personal-number', number: '06 12345678' },
        // { type: 'premium-rate', number: '06 12345678' },
        // { type: 'shared-cost',   : '06 12345678' },
        // { type: 'toll-free', number: '06 12345678' },
        // { type: 'uan', number: '06 12345678' },
        // { type: 'voip', number: '06 12345678' },
        // { type: 'unknown', number: '06 12345678' },
      ];

      for (const { type, number, allowedRegions } of types) {
        it(`returns "${type}" for ${type} numbers`, async () => {
          const el = await fixture(html` <${tag} .allowedRegions="${allowedRegions}"></${tag}> `);
          mimicUserInput(el, number);
          await aTimeout(0);
          expect(el.activePhoneNumberType).to.equal(type);
        });
      }
    });

    describe('User interaction', () => {
      it('sets inputmode to "tel" for mobile keyboard', async () => {
        const el = await fixture(html` <${tag}></${tag}> `);
        // @ts-expect-error [allow-protected] inside tests
        expect(el._inputNode.inputMode).to.equal('tel');
      });

      it('formats according to locale', async () => {
        const el = await fixture(
          html` <${tag} .modelValue="${'+31612345678'}" .allowedRegions="${['NL']}"></${tag}> `,
        );
        await aTimeout(0);
        expect(el.formattedValue).to.equal('+31 6 12345678');
      });

      it('does not reflect back formattedValue after activeRegion change when input still focused', async () => {
        const el = await fixture(html` <${tag} .modelValue="${'+639608920056'}"></${tag}> `);
        expect(el.activeRegion).to.equal('PH');
        el.focus();
        mimicUserInput(el, '+31612345678');
        await el.updateComplete;
        await el.updateComplete;
        expect(el.activeRegion).to.equal('NL');
        expect(el.formattedValue).to.equal('+31 6 12345678');
        expect(el.value).to.equal('+31612345678');
      });
    });

    // https://www.npmjs.com/package/google-libphonenumber
    // https://en.wikipedia.org/wiki/E.164
    describe('Values', () => {
      it('stores a modelValue in E164 format', async () => {
        const el = await fixture(html` <${tag} .allowedRegions="${['NL']}"></${tag}> `);
        mimicUserInput(el, '612345678');
        await aTimeout(0);
        expect(el.modelValue).to.equal('+31612345678');
      });

      it('stores a serializedValue in E164 format', async () => {
        const el = await fixture(html` <${tag} .allowedRegions="${['NL']}"></${tag}> `);
        mimicUserInput(el, '612345678');
        await aTimeout(0);
        expect(el.serializedValue).to.equal('+31612345678');
      });

      it('stores a formattedValue according to format strategy', async () => {
        const el = await fixture(
          html` <${tag} format-strategy="national" .allowedRegions="${['NL']}"></${tag}> `,
        );
        mimicUserInput(el, '612345678');
        await aTimeout(0);
        expect(el.formattedValue).to.equal('06 12345678');
      });

      describe('Format strategies', () => {
        it('supports "national" strategy', async () => {
          const el = await fixture(
            html` <${tag} format-strategy="national" .allowedRegions="${['NL']}"></${tag}> `,
          );
          mimicUserInput(el, '612345678');
          await aTimeout(0);
          expect(el.formattedValue).to.equal('06 12345678');
        });

        it('supports "international" strategy', async () => {
          const el = await fixture(
            html` <${tag} format-strategy="international" .allowedRegions="${['NL']}"></${tag}> `,
          );
          mimicUserInput(el, '612345678');
          await aTimeout(0);
          expect(el.formattedValue).to.equal('+31 6 12345678');
        });

        it('supports "e164" strategy', async () => {
          const el = await fixture(
            html` <${tag} format-strategy="e164" .allowedRegions="${['NL']}"></${tag}> `,
          );
          mimicUserInput(el, '612345678');
          await aTimeout(0);
          expect(el.formattedValue).to.equal('+31612345678');
        });

        it('supports "rfc3966" strategy', async () => {
          const el = await fixture(
            html` <${tag} format-strategy="rfc3966" .allowedRegions="${['NL']}"></${tag}> `,
          );
          mimicUserInput(el, '612345678');
          await aTimeout(0);
          expect(el.formattedValue).to.equal('tel:+31-6-12345678');
        });

        it('supports "significant" strategy', async () => {
          const el = await fixture(
            html` <${tag} format-strategy="significant" .allowedRegions="${['NL']}"></${tag}> `,
          );
          mimicUserInput(el, '612345678');
          await aTimeout(0);
          expect(el.formattedValue).to.equal('612345678');
        });
      });

      // TODO: this should be allowed for in FormatMixin =>
      // in _onModelValueChanged we can add a hook '_checkModelValueFormat'. This needs to be
      // called whenever .modelValue is supplied by devleloper (not when being internal result
      // of parser call).
      // Alternatively, we could be forgiving by attempting to treat it as a view value and
      // correct the format (although strictness will be preferred...)
      it.skip('does not allow modelValues in non E164 format', async () => {
        const el = await fixture(
          html` <${tag} .modelValue="${'612345678'}" .allowedRegions="${['NL']}"></${tag}> `,
        );
        expect(el.modelValue).to.equal(undefined);
      });
    });

    describe('Validation', () => {
      it('applies IsPhoneNumber as default validator', async () => {
        const el = await fixture(html` <${tag}></${tag}> `);
        expect(el.defaultValidators.find(v => v instanceof IsPhoneNumber)).to.be.not.undefined;
      });

      it('configures IsPhoneNumber with regionCode before first validation', async () => {
        const el = fixtureSync(
          html` <${tag} .allowedRegions="${['NL']}" .modelValue="${'612345678'}"></${tag}> `,
        );
        const spy = sinon.spy(el, 'validate');
        const validatorInstance = /** @type {IsPhoneNumber} */ (
          el.defaultValidators.find(v => v instanceof IsPhoneNumber)
        );
        await el.updateComplete;
        expect(validatorInstance.param).to.equal('NL');
        expect(spy).to.have.been.called;
        spy.restore();
      });

      it('updates IsPhoneNumber param on regionCode change', async () => {
        const el = await fixture(
          html` <${tag} .allowedRegions="${['NL']}" .modelValue="${'612345678'}"></${tag}> `,
        );
        const validatorInstance = /** @type {IsPhoneNumber} */ (
          el.defaultValidators.find(v => v instanceof IsPhoneNumber)
        );
        // @ts-expect-error allow protected in tests
        el._setActiveRegion('DE');
        await el.updateComplete;
        expect(validatorInstance.param).to.equal('DE');
      });
    });

    describe('User interaction', () => {
      it('sets inputmode to "tel" for mobile keyboard', async () => {
        const el = await fixture(html` <${tag}></${tag}> `);
        // @ts-expect-error [allow-protected] inside tests
        expect(el._inputNode.inputMode).to.equal('tel');
      });

      it('formats according to locale', async () => {
        const el = await fixture(html` <${tag} .allowedRegions="${['NL']}"></${tag}> `);
        await PhoneUtilManager.loadComplete;
        await el.updateComplete;
        el.modelValue = '612345678';
        expect(el.formattedValue).to.equal('+31 6 12345678');
      });
    });

    describe('Live format', () => {
      it('calls .preprocessor on keyup', async () => {
        const el = await fixture(html` <${tag} .allowedRegions="${['NL']}"></${tag}> `);
        mimicUserInput(el, '+316');
        await aTimeout(0);
        expect(el.value).to.equal('+31 6');
      });
    });

    describe('Accessibility', () => {
      describe('Audit', () => {
        it('passes a11y audit', async () => {
          const el = await fixture(html`<${tag} label="tel" .modelValue=${'0123456789'}></${tag}>`);
          await expect(el).to.be.accessible();
        });

        it('passes a11y audit when readonly', async () => {
          const el = await fixture(
            html`<${tag} label="tel" readonly .modelValue=${'0123456789'}></${tag}>`,
          );
          await expect(el).to.be.accessible();
        });

        it('passes a11y audit when disabled', async () => {
          const el = await fixture(
            html`<${tag} label="tel" disabled .modelValue=${'0123456789'}></${tag}>`,
          );
          await expect(el).to.be.accessible();
        });
      });
    });

    describe('Lazy loading awesome-phonenumber', () => {
      /** @type {(value:any) => void} */
      let resolveLoaded;
      beforeEach(() => {
        ({ resolveLoaded } = mockPhoneUtilManager());
      });

      afterEach(() => {
        restorePhoneUtilManager();
      });

      it('reformats once lib has been loaded', async () => {
        const el = await fixture(
          html` <${tag} .modelValue="${'612345678'}" .allowedRegions="${['NL']}"></${tag}> `,
        );
        expect(el.formattedValue).to.equal('612345678');
        resolveLoaded(undefined);
        await aTimeout(0);
        expect(el.formattedValue).to.equal('+31 6 12345678');
      });

      it('validates once lib has been loaded', async () => {
        const el = await fixture(
          html` <${tag} .modelValue="${'+31612345678'}" .allowedRegions="${['DE']}"></${tag}> `,
        );
        expect(el.hasFeedbackFor).to.eql([]);
        resolveLoaded(undefined);
        await aTimeout(0);
        expect(el.hasFeedbackFor).to.eql(['error']);
      });
    });
  });
}
