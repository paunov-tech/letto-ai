import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCharterCards } from '../scrapers/lib/charter-html.mjs';

const card = `<li ng-repeat="product in item.Items"><a href="/sr/hotel/turska/alanja/xperia?CheckIn=2026-07-18&amp;Night=7"><img src="https://img.example/x.jpg?w=350&amp;h=253"><div itemprop="name" class="name ng-binding">XPERIA SARAY BEACH</div><div class="location"><span class="country">TURSKA</span><span class="city"><span>/</span>ALANJA</span></div><div class="stars"><i class="fa fa-star"></i><i class="fa fa-star"></i><i class="fa fa-star"></i><i class="fa fa-star"></i></div><div class="board ng-binding">ALL INCLUSIVE</div><div class="criteria ng-binding"><span>18.07.2026</span><span>7 noći</span></div><span class="price oldprice ng-binding"><span class="price-number">1.370</span></span><span class="price ng-binding"><span class="price-number">1.136</span><span data-currency-code="eur"></span></span></a></li>`;

test('rendered charter cards normalize current price and package metadata', () => {
  const [result] = parseCharterCards(card, { baseUrl: 'https://bigblue.rs' });
  assert.equal(result.title, 'XPERIA SARAY BEACH');
  assert.equal(result.destination, 'ALANJA');
  assert.equal(result.price, 1136);
  assert.equal(result.currency, 'EUR');
  assert.equal(result.outboundDate, '2026-07-18');
  assert.equal(result.nights, 7);
  assert.equal(result.hotelStars, 4);
  assert.equal(result.allInclusive, true);
  assert.match(result.bookingUrl, /^https:\/\/bigblue\.rs\/sr\/hotel/);
});

test('incomplete placeholders are ignored', () => {
  assert.deepEqual(parseCharterCards('<li ng-repeat="product in item.Items"><div>loading</div></li>', { baseUrl: 'https://kontiki.rs' }), []);
});
