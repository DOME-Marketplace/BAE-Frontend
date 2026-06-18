import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AttachmentRefOrValue, Quote } from 'src/app/models/quote.model';
import { environment } from 'src/environments/environment';
import { QuoteService } from './quote.service';

describe('QuoteService attachment downloads', () => {
  let service: QuoteService;
  let httpMock: HttpTestingController;
  let clickSpy: jasmine.Spy;
  let createObjectUrlSpy: jasmine.Spy;
  let revokeObjectUrlSpy: jasmine.Spy;
  let originalDocumentApi: string;

  beforeEach(() => {
    originalDocumentApi = environment.documentApi;
    environment.documentApi = '/document/v4';

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });

    service = TestBed.inject(QuoteService);
    httpMock = TestBed.inject(HttpTestingController);
    clickSpy = spyOn(HTMLAnchorElement.prototype, 'click').and.stub();
    createObjectUrlSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:document-attachment');
    revokeObjectUrlSpy = spyOn(URL, 'revokeObjectURL').and.stub();
  });

  afterEach(() => {
    httpMock.verify();
    environment.documentApi = originalDocumentApi;
  });

  it('downloads from the direct object URL when content stores a document reference', () => {
    const quote = buildQuoteWithAttachment({
      name: 'supplier-proposal.pdf',
      mimeType: 'application/pdf',
      content: 'urn:ngsi-ld:DocumentSpecification:proposal-1',
      url: 'https://bucket.example.test/tender/supplier-proposal.pdf'
    });

    service.downloadAttachment(quote).subscribe({
      next: () => {
        expect(clickSpy).toHaveBeenCalled();
        expect(createObjectUrlSpy).not.toHaveBeenCalled();
      },
      error: fail
    });
  });

  it('fetches the document specification and decodes its base64 attachment when content stores a document reference', () => {
    const quote = buildQuoteWithAttachment({
      name: 'quote-reference-name.pdf',
      mimeType: 'application/pdf',
      content: 'urn:ngsi-ld:document-specification:6b947d6f-599d-45b2-94c1-9537167c83a3'
    });

    service.downloadAttachment(quote).subscribe({
      next: () => {
        expect(clickSpy).toHaveBeenCalled();
        expect(createObjectUrlSpy).toHaveBeenCalled();
        expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:document-attachment');
      },
      error: fail
    });

    const req = httpMock.expectOne(
      'http://localhost:8004/document/v4/documentSpecification/urn%3Angsi-ld%3Adocument-specification%3A6b947d6f-599d-45b2-94c1-9537167c83a3'
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'urn:ngsi-ld:document-specification:6b947d6f-599d-45b2-94c1-9537167c83a3',
      name: 'document-entity.pdf',
      attachment: [
        {
          content: btoa('pdf-bytes'),
          mimeType: 'application/pdf',
          name: 'document-file.pdf'
        }
      ]
    });
  });

  it('downloads from the document attachment URL when the document specification exposes one', () => {
    const quote = buildQuoteWithAttachment({
      name: 'quote-reference-name.pdf',
      mimeType: 'application/pdf',
      content: 'urn:ngsi-ld:document-specification:url-backed-document'
    });

    service.downloadAttachment(quote).subscribe({
      next: () => {
        expect(clickSpy).toHaveBeenCalled();
        expect(createObjectUrlSpy).not.toHaveBeenCalled();
      },
      error: fail
    });

    const req = httpMock.expectOne(
      'http://localhost:8004/document/v4/documentSpecification/urn%3Angsi-ld%3Adocument-specification%3Aurl-backed-document'
    );
    req.flush({
      attachment: [
        {
          url: 'https://bucket.example.test/tender/document-file.pdf',
          mimeType: 'application/pdf',
          name: 'document-file.pdf'
        }
      ]
    });
  });

  it('errors clearly when the document specification contains an S3 reference instead of downloadable content', () => {
    const quote = buildQuoteWithAttachment({
      name: 's3-reference.pdf',
      mimeType: 'application/pdf',
      content: 'urn:ngsi-ld:document-specification:s3-reference'
    });

    service.downloadAttachment(quote).subscribe({
      next: () => fail('Expected S3 document reference to fail'),
      error: (error: Error) => {
        expect(error.message).toContain('S3 reference');
      }
    });

    const req = httpMock.expectOne(
      'http://localhost:8004/document/v4/documentSpecification/urn%3Angsi-ld%3Adocument-specification%3As3-reference'
    );
    req.flush({
      attachment: [
        {
          content: 's3ref:eyJidWNrZXQiOiJkb2N1bWVudHMiLCJrZXkiOiJmaWxlLnBkZiJ9',
          mimeType: 'application/pdf',
          name: 'document-file.pdf'
        }
      ]
    });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('errors clearly when the document API returns the portal HTML instead of JSON', () => {
    const quote = buildQuoteWithAttachment({
      name: 'html-response.pdf',
      mimeType: 'application/pdf',
      content: 'urn:ngsi-ld:document-specification:html-response'
    });

    service.downloadAttachment(quote).subscribe({
      next: () => fail('Expected HTML document API response to fail'),
      error: (error: Error) => {
        expect(error.message).toContain('Document API response is not JSON');
      }
    });

    const req = httpMock.expectOne(
      'http://localhost:8004/document/v4/documentSpecification/urn%3Angsi-ld%3Adocument-specification%3Ahtml-response'
    );
    req.flush('<!doctype html><html><body>Portal</body></html>', {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/html' }
    });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('errors when the document specification does not contain an encoded attachment', () => {
    const quote = buildQuoteWithAttachment({
      name: 'missing-document-file.pdf',
      mimeType: 'application/pdf',
      content: 'urn:ngsi-ld:document-specification:missing-document-file'
    });

    service.downloadAttachment(quote).subscribe({
      next: () => fail('Expected missing document attachment to fail'),
      error: (error: Error) => {
        expect(error.message).toContain('Document attachment content not found');
      }
    });

    const req = httpMock.expectOne(
      'http://localhost:8004/document/v4/documentSpecification/urn%3Angsi-ld%3Adocument-specification%3Amissing-document-file'
    );
    req.flush({ attachment: [{ name: 'empty.pdf', mimeType: 'application/pdf' }] });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('accepts href as a fallback attachment link when url is missing', () => {
    const quote = buildQuoteWithAttachment({
      name: 'buyer-request.pdf',
      mimeType: 'application/pdf',
      href: 'https://bucket.example.test/tender/buyer-request.pdf'
    });

    service.downloadAttachment(quote).subscribe({
      next: () => expect(clickSpy).toHaveBeenCalled(),
      error: fail
    });
  });

  it('does not treat a document specification reference as a direct download URL', () => {
    const attachment: AttachmentRefOrValue = {
      name: 'missing-link.pdf',
      mimeType: 'application/pdf',
      content: 'urn:ngsi-ld:document-specification:missing-link'
    };

    expect(service.getAttachmentDownloadUrl(attachment))
      .toBeNull();
  });

  function buildQuoteWithAttachment(attachment: AttachmentRefOrValue): Quote {
    return {
      id: 'quote-123456789',
      quoteItem: [
        {
          attachment: [attachment]
        }
      ]
    };
  }
});
