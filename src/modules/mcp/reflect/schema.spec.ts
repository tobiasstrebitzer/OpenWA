import 'reflect-metadata';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, IsEnum } from 'class-validator';
import { fieldToZod, reflectDtoFields, mergeField } from './schema';

enum Priority {
  LOW = 'low',
  HIGH = 'high',
}

class SampleDto {
  @ApiProperty({ description: 'The message text' })
  @IsString()
  text: string;

  // class-validator only (no @ApiProperty): isInt maps to 'integer'.
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}

describe('reflect/schema', () => {
  describe('reflectDtoFields', () => {
    const fields = reflectDtoFields(SampleDto);

    it('reflects a required string with its description', () => {
      expect(fields.text).toMatchObject({ type: 'string', required: true, description: 'The message text' });
    });

    it('reflects an optional integer with a min constraint', () => {
      expect(fields.limit).toMatchObject({ type: 'integer', required: false, min: 1 });
    });

    it('reflects an enum from class-validator', () => {
      expect(fields.priority?.enum?.sort()).toEqual(['high', 'low']);
      expect(fields.priority?.required).toBe(false);
    });

    it('returns no fields for an unreflectable (non-class) type', () => {
      expect(reflectDtoFields(Object)).toEqual({});
    });
  });

  describe('fieldToZod', () => {
    it('builds a required string schema', () => {
      const schema = fieldToZod({ type: 'string', required: true });
      expect(schema.safeParse('hi').success).toBe(true);
      expect(schema.safeParse(42).success).toBe(false);
    });

    it('builds an optional integer with min', () => {
      const schema = fieldToZod({ type: 'integer', required: false, min: 1 });
      expect(schema.safeParse(undefined).success).toBe(true);
      expect(schema.safeParse(0).success).toBe(false);
      expect(schema.safeParse(5).success).toBe(true);
    });

    it('builds an enum schema', () => {
      const schema = fieldToZod({ enum: ['low', 'high'] });
      expect(schema.safeParse('low').success).toBe(true);
      expect(schema.safeParse('mid').success).toBe(false);
    });
  });

  describe('mergeField', () => {
    it('lets defined keys of the override win, ignoring undefined holes', () => {
      expect(mergeField({ type: 'string', required: true }, { description: 'x', required: undefined })).toEqual({
        type: 'string',
        required: true,
        description: 'x',
      });
    });
  });
});
