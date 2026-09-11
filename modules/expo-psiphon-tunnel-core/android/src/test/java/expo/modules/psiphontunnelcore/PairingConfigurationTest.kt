package expo.modules.psiphontunnelcore

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject

class PairingConfigurationTest {
    @Test fun mapsBridgeIdentityToCoreConfigAndClearsInheritedIdentity() {
        val params = InproxyParameters.fromMap(mapOf(
            "maxClients" to 2.0, "maxPersonalClients" to 1.0,
            "personalCompartmentId" to "local-A", "privateKey" to "test-key",
            "limitUpstreamBytesPerSecond" to 1000.0,
            "limitDownstreamBytesPerSecond" to 1000.0,
        )) ?: error("Valid bridge parameters rejected")
        val config = JSONObject().put("InproxyProxyPersonalCompartmentID", "inherited-B")
        assertEquals("local-A", params.applyPersonalPairingConfig(config))
        assertEquals("local-A", config.getString("InproxyProxyPersonalCompartmentID"))
        assertEquals(1, config.getInt("InproxyMaxPersonalClients"))
        assertNull(params.copy(personalCompartmentId = null, maxPersonalClients = 0).applyPersonalPairingConfig(config))
        assertFalse(config.has("InproxyProxyPersonalCompartmentID"))
    }

    @Test fun acknowledgesOnlySuccessfulCoreApplication() {
        var revision = 0L
        val pairing = PairingConfiguration({ ++revision }) {}
        pairing.restorePersisted("A")
        assertEquals(mapOf("revision" to 1L, "status" to "persisted", "personalCompartmentId" to "A"), pairing.snapshot)
        pairing.applyToCore {
            assertEquals("applying", pairing.snapshot["status"])
            assertNull(pairing.snapshot["personalCompartmentId"])
            "B" // Read back from the config actually supplied to the core.
        }
        assertEquals(mapOf("revision" to 3L, "status" to "applied", "personalCompartmentId" to "B"), pairing.snapshot)
        try {
            pairing.applyToCore { throw IllegalStateException("Core rejected configuration") }
            fail("Expected core rejection")
        } catch (_: IllegalStateException) { }
        assertEquals(mapOf("revision" to 4L, "status" to "applying", "personalCompartmentId" to null), pairing.snapshot)
        // Stop completion, not the failed restart, makes persisted configuration shareable.
        pairing.restorePersisted("C")
        assertEquals(mapOf("revision" to 5L, "status" to "persisted", "personalCompartmentId" to "C"), pairing.snapshot)
    }

    @Test fun restoresAbsentIdentityAndNewServiceReadback() {
        var revision = 20L
        val pairing = PairingConfiguration({ ++revision }) {}
        pairing.restorePersisted(null)
        assertNull(pairing.snapshot["personalCompartmentId"])
        pairing.applyToCore { "A" }
        val acknowledged = pairing.snapshot
        val restartedService = PairingConfiguration({ ++revision }) {}
        restartedService.restorePersisted("B")
        assertTrue((restartedService.snapshot["revision"] as Long) > (acknowledged["revision"] as Long))
        assertEquals("persisted", restartedService.snapshot["status"])
    }

    @Test fun stopDuringApplicationCannotBeOverwrittenByLateAcknowledgement() {
        var revision = 0L
        val pairing = PairingConfiguration({ ++revision }) {}
        pairing.applyToCore {
            pairing.applying() // A stop supersedes the in-flight core application.
            "B"
        }
        assertEquals("applying", pairing.snapshot["status"])
        assertNull(pairing.snapshot["personalCompartmentId"])
    }
}
